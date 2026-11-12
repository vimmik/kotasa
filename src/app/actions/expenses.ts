"use server";

import { refresh } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { can, requireMemberFromForm, type OrgContext } from "@/lib/auth";
import { closedError } from "@/lib/closing";
import { orgDb } from "@/lib/org-db";
import { normalizePhone } from "@/lib/phone";
import { isValidDate, todayColombo } from "@/lib/time";
import { receiptScanEnabled, scanReceipt, type ScannedBill } from "@/lib/receipt";
import { billTotals, splitByItems, splitEqually, type Bill } from "@/lib/split";
import { readCopayers } from "@/lib/payers";
import { round2, type ActionState, type Expense } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/;

/** The "By item" bill from the form (hidden JSON field), checked for shape and sense. */
function readBill(raw: string): Bill | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: "Add the items on the bill" };
  }
  const d = data as { items?: unknown; extras?: unknown };
  if (!Array.isArray(d.items) || !Array.isArray(d.extras)) return { error: "Add the items on the bill" };
  if (d.items.length > 60 || d.extras.length > 12) return { error: "That bill has too many lines" };
  const items: Bill["items"] = [];
  for (const it of d.items as { name?: unknown; amount?: unknown; people?: unknown }[]) {
    const name = String(it?.name ?? "").trim().slice(0, 60);
    const amount = round2(Number(it?.amount));
    const people = Array.isArray(it?.people) ? [...new Set(it.people.map(String).filter((x) => UUID.test(x)))] : [];
    if (!name && !(amount > 0)) continue; // an empty row
    if (!(amount > 0)) return { error: `Enter the price of ${name ? `“${name}”` : "each item"}` };
    if (!people.length) return { error: `Pick who had ${name ? `“${name}”` : "each item"}` };
    items.push({ name: name || "Item", amount, people });
  }
  const extras: Bill["extras"] = [];
  for (const x of d.extras as { label?: unknown; amount?: unknown; kind?: unknown }[]) {
    const amount = round2(Number(x?.amount));
    if (!(amount > 0)) continue;
    const kind = x?.kind === "discount" ? "discount" : "charge";
    extras.push({ label: String(x?.label ?? "").trim().slice(0, 40) || (kind === "discount" ? "Discount" : "Charge"), amount, kind });
  }
  if (!items.length) return { error: "Add at least one item and who had it" };
  if (!(billTotals({ items, extras }).total > 0)) return { error: "The discount is bigger than the bill" };
  return { items, extras };
}

/** The creator, anyone who paid (main payer or co-payer), or someone with expense.edit_any. */
async function canEdit(ctx: OrgContext, id: string, e: Pick<Expense, "created_by" | "paid_by">) {
  if (can(ctx, "expense.edit_any") || e.created_by === ctx.member.id || e.paid_by === ctx.member.id) return true;
  const { data } = await orgDb(ctx.org.id)
    .select("expense_copayers", "member_id")
    .eq("expense_id", id)
    .eq("member_id", ctx.member.id)
    .maybeSingle();
  return !!data;
}

export async function saveExpense(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "expense.add")) return { error: "Your role can't add expenses in this group" };
  const db = orgDb(ctx.org.id);
  const id = str(f, "id") || null;

  const title = str(f, "title");
  const byItems = str(f, "split_type") === "items";
  let bill: Bill | null = null;
  if (byItems) {
    const b = readBill(str(f, "bill"));
    if ("error" in b) return b;
    bill = b;
  }
  // By item, the total is what the bill adds up to, not what was typed.
  const amount = bill ? billTotals(bill).total : round2(Number(str(f, "amount")));
  const category = str(f, "category");
  const date = str(f, "expense_date");
  const paidBy = str(f, "paid_by");
  const budgetId = ctx.settings.budgets_enabled ? str(f, "budget_id") || null : null;
  // A bill split by item is stored as a custom split (plus the bill), so everything else reads it as before.
  const splitType = byItems || str(f, "split_type") === "custom" ? "custom" : "equal";
  const note = str(f, "note") || null;
  const participants = bill
    ? [...new Set(bill.items.flatMap((i) => i.people))]
    : [...new Set(f.getAll("participants").map(String).filter((x) => UUID.test(x)))];

  if (!title) return { error: "Add a short title, like “Uber to client”" };
  if (!(amount > 0)) return { error: "Enter the amount" };
  if (!isValidDate(date)) return { error: "Pick a date" };
  if (!participants.length) return { error: "Choose who shares this expense" };
  if (!UUID.test(paidBy)) return { error: "Pick who paid" };
  const copayers = readCopayers(f, paidBy, amount);
  if (!Array.isArray(copayers)) return copayers ?? { error: "Check who paid" };

  // Everyone involved must be an active member of THIS group.
  const ids = [...new Set([paidBy, ...participants, ...copayers.map((c) => c.member_id)])];
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
  if (bill) {
    shares = splitByItems(bill).map((s) => ({ person_id: s.person_id, amount: s.amount })).filter((s) => s.amount > 0);
  } else if (splitType === "custom") {
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
    // The column comes with the 20261112 migration; leave it out unless this is (or was) an itemised bill.
    ...(bill ? { bill } : {}),
  };

  let expenseId = id;
  if (id) {
    if (!UUID.test(id)) return { error: "That expense no longer exists" };
    const { data: existing } = await db.select("expenses").eq("id", id).maybeSingle();
    if (!existing) return { error: "That expense no longer exists" };
    const ex = existing as Expense;
    // Switched from "By item" to another split: forget the old bill.
    if (!bill && ex.bill) Object.assign(row, { bill: null });
    if (!(await canEdit(ctx, id, ex))) return { error: "Only the person who added or paid this, or an admin, can edit it" };
    const closed = await closedError(ctx.org.id, ex.expense_date, date);
    if (closed) return { error: closed };
    if ((cat as { archived: boolean }).archived && ex.category !== category) return { error: "That category is archived" };
    const { error } = await db.update("expenses", row).eq("id", id);
    if (error) return { error: error.message };
    await db.delete("expense_shares").eq("expense_id", id);
  } else {
    if ((cat as { archived: boolean }).archived) return { error: "That category is archived" };
    const closed = await closedError(ctx.org.id, date);
    if (closed) return { error: closed };
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

  // Ignore a failed clear when there's nothing to save (the table may not exist yet).
  const { error: cDel } = await db.delete("expense_copayers").eq("expense_id", expenseId!);
  if (copayers.length) {
    const cErr = cDel ?? (await db.insert("expense_copayers", copayers.map((c) => ({ ...c, expense_id: expenseId })))).error;
    if (cErr) return { error: "Saved, but not the other payers. Edit the expense and add them again." };
  }

  // Replace, so Back doesn't return to the filled-in form and save the expense twice.
  refresh();
  redirect(`${ctx.base}/expenses/${expenseId}`, RedirectType.replace);
}

export async function deleteExpense(f: FormData) {
  const ctx = await requireMemberFromForm(f);
  const id = str(f, "id");
  const db = orgDb(ctx.org.id);
  if (UUID.test(id)) {
    const { data } = await db.select("expenses", "created_by, paid_by, expense_date").eq("id", id).maybeSingle();
    const e = data as Pick<Expense, "created_by" | "paid_by" | "expense_date"> | null;
    // Closed dates are locked (the page hides the button; the database refuses anyway).
    if (e && !(await closedError(ctx.org.id, e.expense_date)) && (await canEdit(ctx, id, e))) await db.delete("expenses").eq("id", id);
  }
  refresh();
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

/** Scans per group per day, and per person per day: each one costs money. */
const SCANS_PER_GROUP_DAY = 40;
const SCANS_PER_PERSON_DAY = 15;

export type ScanState = { error?: string; bill?: ScannedBill } | null;

/** Read a bill photo and hand back its lines; the form fills itself in and nothing is saved yet. */
export async function scanBill(_: ScanState, f: FormData): Promise<ScanState> {
  const ctx = await requireMemberFromForm(f);
  if (!can(ctx, "expense.add")) return { error: "Your role can't add expenses in this group" };
  if (!receiptScanEnabled()) return { error: "Bill scanning isn't set up yet" };
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(str(f, "image"));
  if (!m) return { error: "Pick a photo of the bill" };
  if (m[2].length > 1_500_000) return { error: "That photo is too big. Try again, or crop it to the bill." };

  const db = orgDb(ctx.org.id);
  const since = `${todayColombo()}T00:00:00+05:30`;
  const [{ count: group }, { count: mine }] = await Promise.all([
    db.select("receipt_scans", "id", { count: "exact", head: true }).gte("created_at", since),
    db.select("receipt_scans", "id", { count: "exact", head: true }).gte("created_at", since).eq("member_id", ctx.member.id),
  ]);
  if ((mine ?? 0) >= SCANS_PER_PERSON_DAY) return { error: `You've scanned ${SCANS_PER_PERSON_DAY} bills today. Enter this one by hand, or scan again tomorrow.` };
  if ((group ?? 0) >= SCANS_PER_GROUP_DAY) return { error: "This group has used today's bill scans. Enter this one by hand." };

  const res = await scanReceipt(m[2], m[1] as "image/jpeg" | "image/png" | "image/webp");
  await db.insert("receipt_scans", { member_id: ctx.member.id, ok: !("error" in res) });
  return "error" in res ? { error: res.error } : { bill: res };
}
