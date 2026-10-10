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

/** Net who-owes-whom inside one group, up to and including `until` (YYYY-MM-DD). */
export async function getPairs(orgId: string, opts: { until?: string; circleId?: string } = {}): Promise<Pair[]> {
  const { data, error } = await createAdminClient().rpc("pair_balances", {
    p_org: orgId,
    ...(opts.until ? { p_until: opts.until } : {}),
    ...(opts.circleId ? { p_circle: opts.circleId } : {}),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Pair[]).map((p) => ({ ...p, amount: Number(p.amount) }));
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
