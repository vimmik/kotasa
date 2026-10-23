"use server";

import { refresh } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { can, requireMemberFromForm } from "@/lib/auth";
import { closedError } from "@/lib/closing";
import { saveSettlement } from "@/lib/ledger";
import { orgDb } from "@/lib/org-db";
import { isValidDate, todayColombo } from "@/lib/time";
import { round2, rs, type ActionState } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/;

// ---------------- Settle up ----------------

export async function recordSettlement(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  const me = ctx.member.id;
  const from = str(f, "from_person");
  const to = str(f, "to_person");
  const amount = round2(Number(str(f, "amount")));
  const paidOn = str(f, "paid_on") || todayColombo();
  const note = str(f, "note") || null;
  if (!UUID.test(from) || !UUID.test(to) || from === to) return { error: "Pick who paid whom" };
  if (!(amount > 0)) return { error: "Enter the amount" };
  if (!isValidDate(paidOn)) return { error: "Pick a date" };
  const closed = await closedError(ctx.org.id, paidOn);
  if (closed) return { error: closed };
  if (!can(ctx, "settle.record_any") && me !== from && me !== to)
    return { error: "You can only record payments you made or received" };

  const db = orgDb(ctx.org.id);
  const { data: found } = await db.select("members", "id, full_name").in("id", [from, to]).neq("status", "pending");
  const people = (found ?? []) as { id: string; full_name: string }[];
  if (people.length !== 2) return { error: "Both people must be in this group" };

  const key = str(f, "client_key");
  const saved = await saveSettlement(ctx.org.id, {
    from,
    to,
    amount,
    paidOn,
    note,
    by: me,
    key: UUID.test(key) ? key : null,
    allowDuplicate: f.get("allow_duplicate") === "on",
  });
  if (saved.error !== undefined) return { error: saved.error };
  if (saved.status === "duplicate") {
    const name = (id: string) => people.find((p) => p.id === id)?.full_name.split(" ")[0] ?? "?";
    const mins = saved.createdAt ? Math.max(1, Math.round((Date.now() - Date.parse(saved.createdAt)) / 60000)) : null;
    return {
      confirm: "duplicate",
      error: `${name(from)} paying ${name(to)} ${rs(amount)} was already recorded${mins ? ` ${mins} min ago` : " just now"}. If this is a second payment, tick the box and record it again.`,
    };
  }
  // "exists": this same form was already saved (a second tap), so just show the result.
  // refresh() drops cached pages (Back would show the old balance); replace takes the filled-in
  // form out of history, so Back can't land on it and send the payment again.
  refresh();
  redirect(`${ctx.base}?settled=1`, RedirectType.replace);
}

export async function deleteSettlement(f: FormData) {
  const ctx = await requireMemberFromForm(f);
  const id = str(f, "id");
  if (!UUID.test(id)) return;
  const db = orgDb(ctx.org.id);
  const { data } = await db.select("settlements", "recorded_by, paid_on").eq("id", id).maybeSingle();
  const s = data as { recorded_by: string; paid_on: string } | null;
  if (s && !(await closedError(ctx.org.id, s.paid_on)) && (can(ctx, "settle.record_any") || s.recorded_by === ctx.member.id)) {
    await db.delete("settlements").eq("id", id);
  }
  refresh();
}

// ---------------- Budgets ----------------

export async function saveBudget(_: ActionState, f: FormData): Promise<ActionState> {
  const ctx = await requireMemberFromForm(f);
  if (!ctx.settings.budgets_enabled) return { error: "Budgets are turned off for this group" };
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

  const db = orgDb(ctx.org.id);
  const row = {
    name,
    description: str(f, "description") || null,
    limit_amount: limit,
    starts_on: startsOn,
    ends_on: endsOn,
    closed: f.get("closed") === "on",
  };
  if (id) {
    if (!UUID.test(id)) return { error: "Budget not found" };
    const { data: b } = await db.select("budgets", "created_by").eq("id", id).maybeSingle();
    if (!b) return { error: "Budget not found" };
    if (!can(ctx, "budgets.manage") && (b as { created_by: string }).created_by !== ctx.member.id)
      return { error: "Only the creator or someone who manages budgets can edit this" };
    const { error } = await db.update("budgets", row).eq("id", id);
    if (error) return { error: error.message };
    refresh();
    return { ok: true, message: "Budget saved" };
  }
  if (!can(ctx, "expense.add")) return { error: "Your role can't create budgets in this group" };
  const { data, error } = await db.insert("budgets", { ...row, created_by: ctx.member.id }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Couldn't create" };
  refresh();
  redirect(`${ctx.base}/budgets/${(data as { id: string }).id}`);
}
