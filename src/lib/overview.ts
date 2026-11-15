import "server-only";
import type { OrgContext } from "@/lib/auth";
import { confirmerFor, getClaims } from "@/lib/claims";
import { closedThrough } from "@/lib/closing";
import { monthsSpend, spendEntries } from "@/lib/group-spend";
import { adminTips, analyse, monthList, type Analysis, type Tip } from "@/lib/insights";
import { getPairs, listMembers, type Pair } from "@/lib/ledger";
import { orgDb } from "@/lib/org-db";
import { daysBetween } from "@/lib/periods";
import { createAdminClient } from "@/lib/supabase/server";
import { addDays, todayColombo, weekStart } from "@/lib/time";
import { round2, rs } from "@/lib/types";

/** Who may open Admin › Overview: people who can already see everyone's balance elsewhere. */
export function canSeeOverview(ctx: OrgContext) {
  return ctx.perms.has("sms.send") || ctx.perms.has("books.close") || ctx.perms.has("settle.record_any");
}

export type OverviewPerson = {
  id: string;
  name: string;
  /** has the app (false = SMS-only guest) */
  registered: boolean;
  left: boolean;
  hasPhone: boolean;
  /** + is owed money, − owes */
  net: number;
  /** date of their last payment to anyone, if any */
  lastPaid: string | null;
};

export type Overview = {
  today: string;
  /** everything the group spent, this month against the usual */
  spend: Analysis;
  /** money still to change hands, added up over every "X pays Y" */
  unsettled: number;
  /** people with a balance either way, the ones who owe most first */
  people: OverviewPerson[];
  pairs: { from: string; to: string; amount: number }[];
  members: { active: number; withApp: number; guests: number; pending: number };
  expensesThisWeek: number;
  paymentsThisMonth: { count: number; total: number };
  sms: { enabled: boolean; sentThisMonth: number; cap: number; feesThisMonth: number };
  closedThrough: string | null;
  tips: Tip[];
};

/** Net balance per member from "who pays whom" rows: + is owed, − owes. */
function nets(pairs: Pair[]) {
  const out = new Map<string, number>();
  for (const p of pairs) {
    out.set(p.creditor, (out.get(p.creditor) ?? 0) + p.amount);
    out.set(p.debtor, (out.get(p.debtor) ?? 0) - p.amount);
  }
  return out;
}

/**
 * Each member's net balance as it stood on a date, straight from the ledger (pair_balances:
 * nothing simplified, nothing frozen), so it can be compared with today's.
 */
async function netsAt(orgId: string, until: string) {
  const { data, error } = await createAdminClient().rpc("pair_balances", { p_org: orgId, p_until: until });
  if (error) return null;
  return nets(((data ?? []) as Pair[]).map((p) => ({ ...p, amount: Number(p.amount) })));
}

const SPAN = 6;

/** Everything Admin › Overview shows for one group. Call only after canSeeOverview(ctx). */
export async function getOverview(ctx: OrgContext): Promise<Overview> {
  const { org, settings, base } = ctx;
  const db = orgDb(org.id);
  const today = todayColombo();
  const month = today.slice(0, 7);
  const monthAgo = addDays(today, -30);
  const week = weekStart(today);

  const [people, pairs, then, spend, claims, through, payments, pending, weekCount, smsLogs, first] = await Promise.all([
    listMembers(org.id, { includeInactive: true }),
    getPairs(org.id),
    netsAt(org.id, monthAgo),
    monthsSpend(org.id, monthList(month, SPAN), settings.meals_enabled, today),
    getClaims(org.id),
    closedThrough(org.id),
    db.select("settlements", "from_person, amount, paid_on").order("paid_on", { ascending: false }).limit(1000),
    db.select("members", "id", { count: "exact", head: true }).eq("status", "pending"),
    db.select("expenses", "id", { count: "exact", head: true }).gte("expense_date", week).lte("expense_date", today),
    db.select("sms_logs", "status, fee, week_start, created_at").gte("created_at", `${month}-01T00:00:00+05:30`).limit(1000),
    db.select("expenses", "expense_date").order("expense_date").limit(1),
  ]);

  const now = nets(pairs);
  const lastPaid = new Map<string, string>();
  const paid = { count: 0, total: 0 };
  for (const s of (payments.data ?? []) as { from_person: string; amount: number; paid_on: string }[]) {
    if (!lastPaid.has(s.from_person)) lastPaid.set(s.from_person, s.paid_on); // newest first
    if (s.paid_on.slice(0, 7) === month) {
      paid.count += 1;
      paid.total += Number(s.amount);
    }
  }

  const rows: OverviewPerson[] = people
    .map((p) => ({
      id: p.id,
      name: p.full_name,
      registered: p.registered,
      left: p.status === "inactive",
      hasPhone: !!p.phone,
      net: round2(now.get(p.id) ?? 0),
      lastPaid: lastPaid.get(p.id) ?? null,
    }))
    .filter((p) => Math.abs(p.net) >= 0.01)
    .sort((a, b) => a.net - b.net || a.name.localeCompare(b.name));
  const owing = rows.filter((p) => p.net < 0);

  // Owed a month ago, still owes, and paid nothing since: the part that has been there all month.
  const stale = then
    ? owing
        .filter((p) => (then.get(p.id) ?? 0) <= -1 && (!p.lastPaid || p.lastPaid <= monthAgo))
        .map((p) => ({ name: p.name, amount: round2(Math.min(-p.net, -(then.get(p.id) ?? 0))) }))
        .sort((a, b) => b.amount - a.amount)
    : [];

  const byId = new Map(people.map((p) => [p.id, { id: p.id, registered: p.registered, status: p.status }]));
  const logs = (smsLogs.data ?? []) as { status: string; fee: number; week_start: string }[];
  const firstDate = ((first.data ?? []) as { expense_date: string }[])[0]?.expense_date ?? null;
  const openFrom = through ? addDays(through, 1) : firstDate;
  const active = people.filter((p) => p.status === "active");
  const names = new Map(people.map((p) => [p.id, p.full_name]));

  return {
    today,
    spend: analyse(spendEntries(spend).everyone, { month, today, span: SPAN }),
    unsettled: round2(pairs.reduce((s, p) => s + p.amount, 0)),
    people: rows,
    pairs: [...pairs]
      .sort((a, b) => b.amount - a.amount)
      .map((p) => ({ from: names.get(p.debtor) ?? "Someone", to: names.get(p.creditor) ?? "Someone", amount: p.amount })),
    members: {
      active: active.length,
      withApp: active.filter((p) => p.registered).length,
      guests: active.filter((p) => !p.registered).length,
      pending: pending.count ?? 0,
    },
    expensesThisWeek: weekCount.count ?? 0,
    paymentsThisMonth: { count: paid.count, total: round2(paid.total) },
    sms: {
      enabled: settings.sms_enabled,
      sentThisMonth: logs.filter((l) => l.status === "sent").length,
      cap: Number(settings.sms_monthly_cap) || 0,
      feesThisMonth: round2(logs.reduce((s, l) => (l.status === "sent" ? s + Number(l.fee) : s), 0)),
    },
    closedThrough: through,
    tips: adminTips({
      fmt: rs,
      base,
      can: {
        people: ctx.perms.has("members.manage") || ctx.perms.has("members.invite"),
        sms: ctx.perms.has("sms.send"),
        books: ctx.perms.has("books.close"),
        settings: ctx.perms.has("settings.manage"),
      },
      pendingJoins: pending.count ?? 0,
      claimsForAdmin: claims.filter((c) => c.status === "pending" && confirmerFor(c, byId) === null).length,
      stale,
      noPhone: owing.filter((p) => !p.hasPhone && !p.left).map((p) => ({ name: p.name, amount: -p.net })),
      leftWithBalance: rows.filter((p) => p.left).length,
      owing: owing.length,
      smsEnabled: settings.sms_enabled,
      smsFailed: logs.filter((l) => l.status === "failed" && l.week_start === week).length,
      closedThrough: through,
      daysOpen: openFrom && openFrom <= today ? daysBetween(openFrom, today) : null,
      autoClose: !!settings.auto_close,
    }),
  };
}
