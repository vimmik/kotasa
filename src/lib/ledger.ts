import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { orgDb } from "@/lib/org-db";
import type { LedgerRow, Member, MemberWithLogin } from "@/lib/types";

export type Pair = { debtor: string; creditor: string; amount: number };

/** Members of one group, A–Z. Active only unless includeInactive (pending are never included). */
export async function listMembers(orgId: string, opts: { includeInactive?: boolean } = {}): Promise<MemberWithLogin[]> {
  let q = orgDb(orgId).select("members").order("full_name");
  q = opts.includeInactive ? q.in("status", ["active", "inactive"]) : q.eq("status", "active");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Member[]).map((m) => ({ ...m, registered: !!m.profile_id }));
}

/**
 * Who should pay whom inside one group, up to and including `until` (YYYY-MM-DD). With the
 * group's "fewest payments" setting on, these are simplified transfers (group_balances): chains
 * are shortened, but only to someone the payer shared with in this group, or the collector.
 */
export async function getPairs(orgId: string, opts: { until?: string; circleId?: string } = {}): Promise<Pair[]> {
  const args = {
    p_org: orgId,
    ...(opts.until ? { p_until: opts.until } : {}),
    ...(opts.circleId ? { p_circle: opts.circleId } : {}),
  };
  const db = createAdminClient();
  let { data, error } = await db.rpc("group_balances", args);
  // Before the 20261015 migration has run, only pair_balances exists.
  if (error?.code === "PGRST202") ({ data, error } = await db.rpc("pair_balances", args));
  if (error) throw new Error(error.message);
  return ((data ?? []) as Pair[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export type SettlementInput = {
  from: string;
  to: string;
  amount: number;
  paidOn: string;
  note: string | null;
  by: string;
  /** One per payment form, so the same form sent twice saves once. */
  key: string | null;
  allowDuplicate: boolean;
};

/**
 * Save a payment (record_settlement, 20261023): one at a time per pair of people.
 * "exists" = this form was already saved; "duplicate" = the same payment was saved in the last
 * 10 minutes and nothing new was saved. Errors (e.g. a closed date) come back as `error`.
 */
export async function saveSettlement(
  orgId: string,
  s: SettlementInput,
): Promise<{ status: "saved" | "exists" | "duplicate"; createdAt?: string; error?: undefined } | { error: string }> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("record_settlement", {
    p_org: orgId,
    p_from: s.from,
    p_to: s.to,
    p_amount: s.amount,
    p_paid_on: s.paidOn,
    p_note: s.note,
    p_by: s.by,
    p_key: s.key,
    p_allow_duplicate: s.allowDuplicate,
  });
  if (error?.code === "PGRST202") {
    // Before the 20261023 migration has run.
    const { error: e } = await orgDb(orgId).insert("settlements", {
      from_person: s.from,
      to_person: s.to,
      amount: s.amount,
      paid_on: s.paidOn,
      note: s.note,
      recorded_by: s.by,
    });
    return e ? { error: e.message } : { status: "saved" };
  }
  if (error) return { error: error.message };
  const row = (data as { status: "saved" | "exists" | "duplicate"; created_at: string }[])[0];
  return { status: row.status, createdAt: row.created_at };
}

export type PersonBalance = {
  owes: { personId: string; amount: number }[]; // I owe them
  owed: { personId: string; amount: number }[]; // they owe me
  totalOwe: number;
  totalOwed: number;
  net: number; // + means others owe me overall
};

export function summarize(memberId: string, pairs: Pair[]): PersonBalance {
  const owes = pairs.filter((p) => p.debtor === memberId).map((p) => ({ personId: p.creditor, amount: p.amount }));
  const owed = pairs.filter((p) => p.creditor === memberId).map((p) => ({ personId: p.debtor, amount: p.amount }));
  const totalOwe = owes.reduce((s, x) => s + x.amount, 0);
  const totalOwed = owed.reduce((s, x) => s + x.amount, 0);
  owes.sort((a, b) => b.amount - a.amount);
  owed.sort((a, b) => b.amount - a.amount);
  return { owes, owed, totalOwe, totalOwed, net: totalOwed - totalOwe };
}

/** Every ledger line in this group that involves this member, newest first. */
export async function getLedgerFor(
  orgId: string,
  memberId: string,
  opts: { from?: string; to?: string; limit?: number } = {},
) {
  if (!/^[0-9a-f-]{36}$/.test(memberId)) return [];
  let q = orgDb(orgId)
    .select("ledger")
    .or(`debtor.eq.${memberId},creditor.eq.${memberId}`)
    .order("entry_date", { ascending: false })
    .limit(opts.limit ?? 300);
  if (opts.from) q = q.gte("entry_date", opts.from);
  if (opts.to) q = q.lte("entry_date", opts.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as LedgerRow[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** From one member's point of view: + they are owed, − they owe. */
export function signedFor(memberId: string, row: LedgerRow) {
  return row.creditor === memberId ? row.amount : -row.amount;
}
