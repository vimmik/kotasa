"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { can, requireMemberFromForm, type OrgContext } from "@/lib/auth";
import { orgDb } from "@/lib/org-db";
import { normalizePhone } from "@/lib/phone";
import { isValidDate } from "@/lib/time";
import { splitEqually } from "@/lib/split";
import { round2, type ActionState, type Expense } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/;

function canEdit(ctx: OrgContext, e: Pick<Expense, "created_by" | "paid_by">) {
  return can(ctx, "expense.edit_any") || e.created_by === ctx.member.id || e.paid_by === ctx.member.id;
}

export async function saveExpense(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "expense.add")) return { error: "Your role can't add expenses in this group" };
  const db = orgDb(ctx.org.id);
  const id = str(f, "id") || null;

  const title = str(f, "title");
  const amount = round2(Number(str(f, "amount")));
  const category = str(f, "category");
  const date = str(f, "expense_date");
  const paidBy = str(f, "paid_by");
  const budgetId = ctx.settings.budgets_enabled ? str(f, "budget_id") || null : null;
  const splitType = str(f, "split_type") === "custom" ? "custom" : "equal";
  const note = str(f, "note") || null;
  const participants = [...new Set(f.getAll("participants").map(String).filter((x) => UUID.test(x)))];

  if (!title) return { error: "Add a short title, like “Uber to client”" };
  if (!(amount > 0)) return { error: "Enter the amount" };
  if (!isValidDate(date)) return { error: "Pick a date" };
  if (!participants.length) return { error: "Choose who shares this expense" };
  if (!UUID.test(paidBy)) return { error: "Pick who paid" };

  // Everyone involved must be an active member of THIS group.
  const ids = [...new Set([paidBy, ...participants])];
  // The checks are independent reads, so they share one round trip.
  const [{ data: found }, { data: cat }, budget] = await Promise.all([
    db.select("members", "id, status").in("id", ids),
    db.select("org_categories", "key, archived").eq("key", category).maybeSingle(),
    budgetId ? db.select("budgets", "id").eq("id", budgetId).eq("closed", false).maybeSingle() : null,
  ]);
  if ((found ?? []).length !== ids.length || (found as { status: string }[]).some((p) => p.status !== "active"))
    return { error: "Someone in this expense isn't an active member of this group" };
  if (!cat) return { error: "Pick a category" };
  if (budget && !budget.data) return { error: "That budget is closed or gone" };

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
    if (!UUID.test(id)) return { error: "That expense no longer exists" };
    const { data: existing } = await db.select("expenses", "created_by, paid_by, category").eq("id", id).maybeSingle();
    if (!existing) return { error: "That expense no longer exists" };
    const ex = existing as Pick<Expense, "created_by" | "paid_by" | "category">;
    if (!canEdit(ctx, ex)) return { error: "Only the person who added or paid this, or an admin, can edit it" };
    if ((cat as { archived: boolean }).archived && ex.category !== category) return { error: "That category is archived" };
    const { error } = await db.update("expenses", row).eq("id", id);
    if (error) return { error: error.message };
    await db.delete("expense_shares").eq("expense_id", id);
  } else {
    if ((cat as { archived: boolean }).archived) return { error: "That category is archived" };
    const { data, error } = await db
      .insert("expenses", { ...row, created_by: ctx.member.id })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Couldn't save" };
    expenseId = (data as { id: string }).id;
  }

  const { error: sErr } = await db.insert(
    "expense_shares",
    shares.map((s) => ({ ...s, expense_id: expenseId })),
  );
  if (sErr) return { error: sErr.message };

  redirect(`${ctx.base}/expenses/${expenseId}`);
}

export async function deleteExpense(f: FormData) {
  const ctx = await requireMemberFromForm(f);
  const id = str(f, "id");
  const db = orgDb(ctx.org.id);
  if (UUID.test(id)) {
    const { data: e } = await db.select("expenses", "created_by, paid_by").eq("id", id).maybeSingle();
    if (e && canEdit(ctx, e as Pick<Expense, "created_by" | "paid_by">)) await db.delete("expenses").eq("id", id);
  }
  redirect(`${ctx.base}/expenses`);
}

/** Add someone who doesn't use the app yet (name + mobile) so they can share costs and get the SMS. */
export async function addGuest(_: ActionState, f: FormData): Promise<ActionState & { personId?: string }> {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "members.invite")) return { error: "Your role can't add people to this group" };
  const name = str(f, "full_name");
  const phone = normalizePhone(str(f, "phone"));
  if (!name) return { error: "Enter their name" };
  if (!phone) return { error: "Enter a valid mobile number (07XXXXXXXX)" };
  const db = orgDb(ctx.org.id);
  const { data: dup } = await db.select("members", "id, full_name").eq("phone", phone).maybeSingle();
  if (dup) return { error: `That number already belongs to ${(dup as { full_name: string }).full_name}` };
  const { data, error } = await db
    .insert("members", { full_name: name, phone, created_by: ctx.member.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't add" };
  refresh();
  return { ok: true, message: `${name} added`, personId: (data as { id: string }).id };
}
