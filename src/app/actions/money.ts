"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { isValidDate, todayColombo } from "@/lib/time";
import { round2, type ActionState } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ---------------- Settle up ----------------

export async function recordSettlement(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireMember();
  const from = str(f, "from_person");
  const to = str(f, "to_person");
  const amount = round2(Number(str(f, "amount")));
  const paidOn = str(f, "paid_on") || todayColombo();
  const note = str(f, "note") || null;
  if (!from || !to || from === to) return { error: "Pick who paid whom" };
  if (!(amount > 0)) return { error: "Enter the amount" };
  if (!isValidDate(paidOn)) return { error: "Pick a date" };
  if (!me.is_admin && me.id !== from && me.id !== to)
    return { error: "You can only record payments you made or received" };

  const { error } = await createAdminClient()
    .from("settlements")
    .insert({ from_person: from, to_person: to, amount, paid_on: paidOn, note, recorded_by: me.id });
  if (error) return { error: error.message };
  redirect("/?settled=1");
}

export async function deleteSettlement(f: FormData) {
  const me = await requireMember();
  const admin = createAdminClient();
  const { data: s } = await admin.from("settlements").select("recorded_by").eq("id", str(f, "id")).maybeSingle();
  if (s && (me.is_admin || s.recorded_by === me.id)) {
    await admin.from("settlements").delete().eq("id", str(f, "id"));
  }
  refresh();
}

// ---------------- Budgets ----------------

export async function saveBudget(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireMember();
  const id = str(f, "id") || null;
  const name = str(f, "name");
  const limitRaw = str(f, "limit_amount");
  const limit = limitRaw ? round2(Number(limitRaw)) : null;
  const startsOn = str(f, "starts_on") || null;
  const endsOn = str(f, "ends_on") || null;
  if (!name) return { error: "Give the budget a name" };
  if (limit !== null && !(limit > 0)) return { error: "Limit must be more than 0, or leave it empty" };
  if ((startsOn && !isValidDate(startsOn)) || (endsOn && !isValidDate(endsOn))) return { error: "Check the dates" };
  if (startsOn && endsOn && endsOn < startsOn) return { error: "End date is before the start date" };

  const admin = createAdminClient();
  const row = {
    name,
    description: str(f, "description") || null,
    limit_amount: limit,
    starts_on: startsOn,
    ends_on: endsOn,
    closed: f.get("closed") === "on",
  };
  if (id) {
    const { data: b } = await admin.from("budgets").select("created_by").eq("id", id).maybeSingle();
    if (!b) return { error: "Budget not found" };
    if (!me.is_admin && b.created_by !== me.id) return { error: "Only the creator or an admin can edit this budget" };
    const { error } = await admin.from("budgets").update(row).eq("id", id);
    if (error) return { error: error.message };
    refresh();
    return { ok: true, message: "Budget saved" };
  }
  const { data, error } = await admin.from("budgets").insert({ ...row, created_by: me.id }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Couldn't create" };
  redirect(`/budgets/${data.id}`);
}
