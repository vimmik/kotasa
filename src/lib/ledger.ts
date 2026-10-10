import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { LedgerRow, Person, PersonWithLogin } from "@/lib/types";

export type Pair = { debtor: string; creditor: string; amount: number };

export async function listPeople(opts: { includeInactive?: boolean } = {}): Promise<PersonWithLogin[]> {
  const admin = createAdminClient();
  let q = admin.from("people").select("*, person_logins(auth_user_id)").order("full_name");
  if (!opts.includeInactive) q = q.eq("status", "active");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => {
    const { person_logins, ...rest } = p as Person & { person_logins: unknown[] };
    return { ...(rest as Person), registered: (person_logins?.length ?? 0) > 0 };
  });
}

/** Net who-owes-whom, up to and including `until` (YYYY-MM-DD). */
export async function getPairs(until?: string): Promise<Pair[]> {
  const { data, error } = await createAdminClient().rpc("pair_balances", until ? { p_until: until } : {});
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

export function summarize(personId: string, pairs: Pair[]): PersonBalance {
  const owes = pairs.filter((p) => p.debtor === personId).map((p) => ({ personId: p.creditor, amount: p.amount }));
  const owed = pairs.filter((p) => p.creditor === personId).map((p) => ({ personId: p.debtor, amount: p.amount }));
  const totalOwe = owes.reduce((s, x) => s + x.amount, 0);
  const totalOwed = owed.reduce((s, x) => s + x.amount, 0);
  owes.sort((a, b) => b.amount - a.amount);
  owed.sort((a, b) => b.amount - a.amount);
  return { owes, owed, totalOwe, totalOwed, net: totalOwed - totalOwe };
}

/** Every ledger line that involves this person, newest first. */
export async function getLedgerFor(personId: string, opts: { from?: string; to?: string; limit?: number } = {}) {
  let q = createAdminClient()
    .from("ledger")
    .select("*")
    .or(`debtor.eq.${personId},creditor.eq.${personId}`)
    .order("entry_date", { ascending: false })
    .limit(opts.limit ?? 300);
  if (opts.from) q = q.gte("entry_date", opts.from);
  if (opts.to) q = q.lte("entry_date", opts.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as LedgerRow[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** From one person's point of view: + they are owed, − they owe. */
export function signedFor(personId: string, row: LedgerRow) {
  return row.creditor === personId ? row.amount : -row.amount;
}
