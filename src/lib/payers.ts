import "server-only";
import { orgDb } from "@/lib/org-db";
import { round2, type ActionState, type Copayer } from "@/lib/types";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Co-payers of these expenses, by expense id. Empty if there are none (or the 20261015
 * migration hasn't run yet), so pages never break on it.
 */
export async function getExpenseCopayers(orgId: string, expenseIds: string[]): Promise<Map<string, Copayer[]>> {
  const out = new Map<string, Copayer[]>();
  if (!expenseIds.length) return out;
  const { data, error } = await orgDb(orgId).select("expense_copayers", "expense_id, member_id, amount").in("expense_id", expenseIds);
  if (error) return out;
  for (const r of (data ?? []) as (Copayer & { expense_id: string })[]) {
    out.set(r.expense_id, [...(out.get(r.expense_id) ?? []), { member_id: r.member_id, amount: Number(r.amount) }]);
  }
  return out;
}

/** What each person put in: co-payers their part, the main payer the rest. */
export function paidByEach(total: number, mainPayer: string, copayers: Copayer[]): Map<string, number> {
  const paid = new Map(copayers.map((c) => [c.member_id, c.amount]));
  paid.set(mainPayer, round2(total - copayers.reduce((s, c) => s + c.amount, 0)));
  return paid;
}

/**
 * The "someone else paid part of it" rows of a form: repeated copayer_id + copayer_amount.
 * Checks the shape only; the caller checks that the people are active members.
 */
export function readCopayers(f: FormData, mainPayer: string | null, total: number | null): Copayer[] | ActionState {
  const ids = f.getAll("copayer_id").map(String);
  const amounts = f.getAll("copayer_amount").map(String);
  const rows: Copayer[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i].trim();
    const amount = round2(Number((amounts[i] ?? "").replace(/,/g, "")));
    if (!id && !(amount > 0)) continue; // an empty row
    if (!UUID.test(id)) return { error: "Pick who else paid" };
    if (!(amount > 0)) return { error: "Enter how much each other payer put in" };
    if (id === mainPayer) return { error: "The main payer is already counted. Pick someone else, or remove that row." };
    if (rows.some((r) => r.member_id === id)) return { error: "Each person can be listed as a payer only once" };
    rows.push({ member_id: id, amount });
  }
  if (total !== null && rows.length && round2(rows.reduce((s, r) => s + r.amount, 0)) >= total)
    return { error: "The other payers add up to the whole bill or more. The main payer has to have paid something." };
  return rows;
}
