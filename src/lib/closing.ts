import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { orgDb } from "@/lib/org-db";
import { fmtDay } from "@/lib/time";

/**
 * Closing the books (20261018): balances up to `closed_through` are frozen as they were shown,
 * and nothing dated on or before it can be added, changed or deleted. The latest close is in
 * force. The database enforces the lock; these helpers give people a clear message first.
 */
export type Closing = {
  id: string;
  closed_through: string;
  closed_by: string | null;
  note: string | null;
  closed_at: string;
};

/** Every close in this group, newest first. Empty before the migration has run. */
export const getClosings = cache(async (orgId: string): Promise<Closing[]> => {
  const { data, error } = await orgDb(orgId).select("org_closings").order("closed_through", { ascending: false });
  if (error) return [];
  return (data ?? []) as Closing[];
});

/** The last closed date (YYYY-MM-DD), or null when nothing is closed. */
export async function closedThrough(orgId: string): Promise<string | null> {
  return (await getClosings(orgId))[0]?.closed_through ?? null;
}

/** An error sentence when any of these dates is closed, else null. */
export async function closedError(orgId: string, ...dates: (string | null | undefined)[]): Promise<string | null> {
  const through = await closedThrough(orgId);
  if (!through || !dates.some((d) => d && d <= through)) return null;
  return `The books are closed up to ${fmtDay(through)}. Pick a later date, or ask an owner to reopen them.`;
}

/** Freeze everyone's balance up to `through` and lock those dates. */
export async function closeBooks(orgId: string, through: string, by: string | null, note: string | null) {
  return createAdminClient().rpc("close_books", { p_org: orgId, p_through: through, p_by: by, p_note: note });
}

/** Frozen balances of one close, as stored. */
export async function getClosingBalances(orgId: string, closingId: string) {
  const { data } = await orgDb(orgId).select("org_closing_balances", "debtor, creditor, amount").eq("closing_id", closingId);
  return ((data ?? []) as { debtor: string; creditor: string; amount: number }[]).map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));
}
