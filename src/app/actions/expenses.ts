"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { isValidDate } from "@/lib/time";
import { splitEqually } from "@/lib/split";
import { CATEGORIES, round2, type ActionState, type Expense, type Person } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function canEdit(me: Person, e: Pick<Expense, "created_by" | "paid_by">) {
  return me.is_admin || e.created_by === me.id || e.paid_by === me.id;
}

export async function saveExpense(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireMember();
  const admin = createAdminClient();
  const id = str(f, "id") || null;

  const title = str(f, "title");
  const amount = round2(Number(str(f, "amount")));
  const category = CATEGORIES.some((c) => c.id === str(f, "category")) ? str(f, "category") : "other";
  const date = str(f, "expense_date");
  const paidBy = str(f, "paid_by");
  const budgetId = str(f, "budget_id") || null;
  const splitType = str(f, "split_type") === "custom" ? "custom" : "equal";
  const note = str(f, "note") || null;
  const participants = [...new Set(f.getAll("participants").map(String).filter(Boolean))];

  if (!title) return { error: "Add a short title, like “Uber to client”" };
  if (!(amount > 0)) return { error: "Enter the amount" };
  if (!isValidDate(date)) return { error: "Pick a date" };
  if (!participants.length) return { error: "Choose who shares this expense" };

  const ids = [...new Set([paidBy, ...participants])];
  const { data: found } = await admin.from("people").select("id, status").in("id", ids);
  if ((found ?? []).length !== ids.length || found!.some((p) => p.status !== "active"))
    return { error: "Someone in this expense isn't an active member" };

  let shares: { person_id: string; amount: number }[];
  if (splitType === "custom") {
    shares = participants.map((pid) => ({ person_id: pid, amount: round2(Number(str(f, `share_${pid}`)) || 0) }));
    if (shares.some((s) => s.amount < 0)) return { error: "Shares can't be negative" };
    const sum = round2(shares.reduce((s, x) => s + x.amount, 0));
    if (Math.abs(sum - amount) > 0.009)
      return { error: `Shares add up to Rs. ${sum}, but the expense is Rs. ${amount}` };
    shares = shares.filter((s) => s.amount > 0);
  } else {
    shares = splitEqually(amount, participants);
  }

  const row = {
    title,
    amount,
    category,
    expense_date: date,
    paid_by: paidBy,
    budget_id: budgetId,
    split_type: splitType,
    note,
    updated_at: new Date().toISOString(),
  };

  let expenseId = id;
  if (id) {
    const { data: existing } = await admin.from("expenses").select("created_by, paid_by").eq("id", id).maybeSingle();
    if (!existing) return { error: "That expense no longer exists" };
    if (!canEdit(me, existing)) return { error: "Only the person who added or paid this, or an admin, can edit it" };
    const { error } = await admin.from("expenses").update(row).eq("id", id);
    if (error) return { error: error.message };
    await admin.from("expense_shares").delete().eq("expense_id", id);
  } else {
    const { data, error } = await admin
      .from("expenses")
      .insert({ ...row, created_by: me.id })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Couldn't save" };
    expenseId = data.id;
  }

  const { error: sErr } = await admin
    .from("expense_shares")
    .insert(shares.map((s) => ({ ...s, expense_id: expenseId })));
  if (sErr) return { error: sErr.message };

  redirect(`/expenses/${expenseId}`);
}

export async function deleteExpense(f: FormData) {
  const me = await requireMember();
  const id = str(f, "id");
  const admin = createAdminClient();
  const { data: e } = await admin.from("expenses").select("created_by, paid_by").eq("id", id).maybeSingle();
  if (e && canEdit(me, e)) await admin.from("expenses").delete().eq("id", id);
  redirect("/expenses");
}

/** Any member can add someone who doesn't use the app yet (name + mobile) so they can be billed by SMS. */
export async function addGuest(_: ActionState, f: FormData): Promise<ActionState & { personId?: string }> {
  const me = await requireMember();
  const name = str(f, "full_name");
  const phone = normalizePhone(str(f, "phone"));
  if (!name) return { error: "Enter their name" };
  if (!phone) return { error: "Enter a valid mobile number (07XXXXXXXX)" };
  const admin = createAdminClient();
  const { data: dup } = await admin.from("people").select("id, full_name").eq("phone", phone).maybeSingle();
  if (dup) return { error: `That number already belongs to ${dup.full_name}` };
  const { data, error } = await admin
    .from("people")
    .insert({ full_name: name, phone, created_by: me.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't add" };
  refresh();
  return { ok: true, message: `${name} added`, personId: data.id };
}
