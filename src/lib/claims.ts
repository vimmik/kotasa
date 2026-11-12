import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { orgDb } from "@/lib/org-db";
import { todayColombo } from "@/lib/time";

/**
 * "Paid earlier" (20261113): a payment recorded with a date before today waits for the person who
 * got the money to confirm it, and only then becomes a real payment (confirm_settlement_claim).
 * Until then it is not in the ledger, so nobody's balance moves on someone's word alone.
 */
export type Claim = {
  id: string;
  from_person: string;
  to_person: string;
  amount: number;
  paid_on: string;
  note: string | null;
  recorded_by: string | null;
  status: "pending" | "confirmed" | "declined" | "cancelled";
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

type Person = { id: string; registered: boolean; status: string };

/**
 * Who confirms: the receiver. A receiver without the app (or who has left) can't, so then anyone
 * with settle.record_any does (`null` here). Never the person who recorded it (see canDecide).
 */
export function confirmerFor(c: Pick<Claim, "to_person">, people: Map<string, Person>): string | null {
  const to = people.get(c.to_person);
  return to?.registered && to.status === "active" ? to.id : null;
}

export function canDecide(c: Claim, me: string, canRecordAny: boolean, people: Map<string, Person>) {
  if (c.status !== "pending" || c.recorded_by === me) return false;
  const who = confirmerFor(c, people);
  return who ? who === me : canRecordAny;
}

/**
 * A payment needs confirming when it is dated before today and the receiver didn't record it
 * themselves (a receiver saying "I got it" only lowers the payer's balance).
 */
export function needsConfirming(p: { to: string; paidOn: string; by: string }) {
  return p.paidOn < todayColombo() && p.by !== p.to;
}

/** Waiting payments, plus ones decided in the last 14 days (so the payer sees "not received"). */
export async function getClaims(orgId: string): Promise<Claim[]> {
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data, error } = await orgDb(orgId)
    .select("settlement_claims")
    .or(`status.eq.pending,decided_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return []; // before the migration has run
  return ((data ?? []) as Claim[]).map((c) => ({ ...c, amount: Number(c.amount) }));
}

export async function getClaim(orgId: string, id: string): Promise<Claim | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await orgDb(orgId).select("settlement_claims").eq("id", id).maybeSingle();
  return data ? { ...(data as Claim), amount: Number((data as Claim).amount) } : null;
}

/** Save a waiting payment. The same form sent twice saves once (client_key). */
export async function createClaim(
  orgId: string,
  c: { from: string; to: string; amount: number; paidOn: string; note: string | null; by: string; key: string | null },
): Promise<{ error?: string }> {
  const db = orgDb(orgId);
  const { data: same } = await db
    .select("settlement_claims", "id, client_key")
    .eq("status", "pending")
    .eq("from_person", c.from)
    .eq("to_person", c.to)
    .eq("amount", c.amount)
    .limit(1);
  const found = (same ?? []) as { id: string; client_key: string | null }[];
  if (found.length) return found[0].client_key && found[0].client_key === c.key ? {} : { error: "This payment is already waiting to be confirmed. Record another one of the same amount after that one is confirmed." };
  const { error } = await db.insert("settlement_claims", {
    from_person: c.from,
    to_person: c.to,
    amount: c.amount,
    paid_on: c.paidOn,
    note: c.note,
    recorded_by: c.by,
    client_key: c.key,
  });
  if (error?.code === "23505") return {}; // this form was already saved
  return error ? { error: "Couldn't save the payment. Try again." } : {};
}

/** Confirm: becomes a real payment, once. */
export async function confirmClaim(orgId: string, id: string, by: string) {
  return createAdminClient().rpc("confirm_settlement_claim", {
    p_org: orgId,
    p_claim: id,
    p_by: by,
    p_today: todayColombo(),
  });
}

/** Not received (by the confirmer) or cancelled (by whoever recorded it). Only while waiting. */
export async function closeClaim(orgId: string, id: string, by: string, status: "declined" | "cancelled") {
  return orgDb(orgId)
    .update("settlement_claims", { status, decided_by: by, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
}
