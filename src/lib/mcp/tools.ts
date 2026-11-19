import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAcrossGroups } from "@/lib/across";
import { getMemberships, orgContextFor, type OrgContext } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { getLedgerBetween, getLedgerFor, getPairs, listMembers, signedFor, summarize } from "@/lib/ledger";
import { meDb } from "@/lib/me-db";
import type { McpCaller } from "@/lib/mcp/auth";
import { getCategories } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { canSeeOverview } from "@/lib/overview";
import { getExpenseCopayers, paidByEach } from "@/lib/payers";
import { payDetailsFor } from "@/lib/pay-details";
import { startOfMonth } from "@/lib/periods";
import { budgetStatus, getBudgets, getSpendByMonth, spendWindow } from "@/lib/personal";
import { addDays, isValidDate, todayColombo } from "@/lib/time";
import { round2, type Expense, type ExpenseShare, type LedgerRow } from "@/lib/types";
import type { Bill } from "@/lib/split";

/**
 * Kotasa as an MCP server: read-only tools over the caller's own groups and Me (Kavi, 2026-11-19:
 * read-only first, no payments). Every tool goes through the same checks as the app: an active
 * membership (orgContextFor), group data through orgDb / getPairs only, Me data through meDb for
 * the caller's own profile. Nothing here writes. Phone numbers and emails are never returned.
 */

const INSTRUCTIONS = `${BRAND.name} tracks shared expenses in groups (office, friends, trips, family) and a private personal budget ("Me").
- Start with list_groups: it gives each group's "group" id (its slug), which every group tool needs.
- Money is in the group's currency (most groups use LKR, shown as Rs.). Dates are YYYY-MM-DD in Sri Lanka time.
- Balances (group_balances) are what to pay now: debts are netted, chains may be shortened ("fewest payments"), and closed books are respected. Never add up history yourself to get a balance.
- In history, a positive amount means the other person owes the caller; negative means the caller owes them.
- These tools only read. To add an expense or record a payment, the person uses the ${BRAND.name} app.`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD");
const group = z.string().min(3).max(40).describe('The group\'s id from list_groups (its slug, e.g. "office")');

/** A tool's answer: JSON text the model reads. */
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }] };
}
function fail(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** A sentence for the model that the tool turns into an error result. */
class ToolError extends Error {}

/** Runs a tool body; ToolError and bad input become an error result, anything else a generic one. */
async function run(body: () => Promise<unknown>) {
  try {
    return ok(await body());
  } catch (e) {
    if (e instanceof ToolError) return fail(e.message);
    console.error("[mcp] tool failed", e);
    return fail("Something went wrong reading Kotasa. Try again in a moment.");
  }
}

/** A real calendar date: isValidDate alone lets "2026-13-01" roll over into the next year. */
const realDate = (d: string) => isValidDate(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

function checkRange(from: string | undefined, to: string | undefined, maxDays: number) {
  if (from && !realDate(from)) throw new ToolError(`"${from}" is not a date. Use YYYY-MM-DD.`);
  if (to && !realDate(to)) throw new ToolError(`"${to}" is not a date. Use YYYY-MM-DD.`);
  if (from && to && from > to) throw new ToolError("The start date is after the end date.");
  if (from && to && addDays(from, maxDays) < to) throw new ToolError(`Ask for at most ${maxDays} days at a time.`);
}

export function createKotasaServer(caller: McpCaller) {
  const { profile } = caller;
  const server = new McpServer({ name: "kotasa", title: BRAND.name, version: "1.0.0" }, { instructions: INSTRUCTIONS });

  /** The caller's active membership in this group. Not a member looks the same as no such group. */
  async function member(slug: string): Promise<OrgContext> {
    const ctx = await orgContextFor(profile, slug.trim().toLowerCase());
    if (!ctx || ctx.member.status !== "active")
      throw new ToolError(`You're not in a group called "${slug}". Call list_groups to see your groups.`);
    return ctx;
  }

  /** Member id -> display name ("You" for the caller), including people who left. */
  async function namesIn(ctx: OrgContext) {
    const people = await listMembers(ctx.org.id, { includeInactive: true });
    const names = new Map(people.map((p) => [p.id, p.id === ctx.member.id ? "You" : p.full_name]));
    return (id: string | null | undefined) => (id && names.get(id)) || "Someone";
  }

  server.registerTool(
    "list_groups",
    {
      title: "List my groups",
      description:
        "The groups the person is in, with what they owe and are owed in each. Call this first: other group tools need the group id it returns.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      run(async () => {
        const all = await getMemberships(profile.id);
        const groups = await Promise.all(
          all
            .filter((m) => m.member.status !== "pending")
            .map(async ({ member: me, org }) => {
              const b = summarize(me.id, await getPairs(org.id));
              return {
                group: org.slug,
                name: org.name,
                kind: org.kind,
                currency: org.currency,
                status: me.status === "active" ? "member" : "left (history kept)",
                role: me.role_key,
                you_owe: round2(b.totalOwe),
                owed_to_you: round2(b.totalOwed),
                net: round2(b.net),
              };
            }),
        );
        return {
          you: profile.full_name,
          groups,
          waiting_for_approval: all.filter((m) => m.member.status === "pending").map((m) => m.org.name),
          note: "net = owed_to_you - you_owe. Positive: others owe you overall.",
        };
      }),
  );

  server.registerTool(
    "group_balances",
    {
      title: "Balances in a group",
      description:
        "Who the person owes and who owes them in one group right now, with the bank details of the people they owe. Group admins who see every balance also get the full list of who pays whom.",
      inputSchema: { group },
      annotations: READ_ONLY,
    },
    ({ group: slug }) =>
      run(async () => {
        const ctx = await member(slug);
        const [pairs, nameOf, pay] = await Promise.all([getPairs(ctx.org.id), namesIn(ctx), payDetailsFor(ctx.org.id)]);
        const b = summarize(ctx.member.id, pairs);
        return {
          group: ctx.org.name,
          currency: ctx.org.currency,
          you_owe: b.owes.map((x) => ({
            member_id: x.personId,
            name: nameOf(x.personId),
            amount: x.amount,
            pay_to: pay.get(x.personId) ?? null,
          })),
          owed_to_you: b.owed.map((x) => ({ member_id: x.personId, name: nameOf(x.personId), amount: x.amount })),
          total_you_owe: round2(b.totalOwe),
          total_owed_to_you: round2(b.totalOwed),
          net: round2(b.net),
          how_to_pay: b.totalOwe > 0 ? (ctx.settings.pay_note ?? null) : null,
          everyone: canSeeOverview(ctx)
            ? pairs
                .slice()
                .sort((x, y) => y.amount - x.amount)
                .map((p) => ({ from: nameOf(p.debtor), to: nameOf(p.creditor), amount: p.amount }))
            : undefined,
        };
      }),
  );

  server.registerTool(
    "list_expenses",
    {
      title: "List expenses",
      description:
        "Expenses in one group, newest first, with who paid and the person's own share. Defaults to the last 30 days and to expenses involving the person. With search, looks through every date unless from/to are given.",
      inputSchema: {
        group,
        from: date.optional(),
        to: date.optional(),
        search: z.string().max(40).optional().describe("Words to find in the title or note"),
        everyone: z.boolean().optional().describe("true: include expenses the person isn't part of"),
        limit: z.number().int().min(1).max(200).optional().describe("Most rows to return (default 60)"),
      },
      annotations: READ_ONLY,
    },
    ({ group: slug, from, to, search, everyone, limit }) =>
      run(async () => {
        checkRange(from, to, 400);
        const ctx = await member(slug);
        const today = todayColombo();
        // Characters that mean something in the filter syntax are dropped (like the Expenses page).
        const q = (search ?? "").replace(/[%_,()*\\"]/g, " ").trim();
        const start = from ?? (q ? undefined : addDays(today, -30));
        const end = to ?? (q ? undefined : today);
        const max = limit ?? 60;

        let query = orgDb(ctx.org.id).select("expenses", "*, expense_shares(person_id, amount)");
        if (q) query = query.or(`title.ilike.%${q}%,note.ilike.%${q}%`);
        if (start) query = query.gte("expense_date", start);
        if (end) query = query.lte("expense_date", end);
        const [{ data, error }, nameOf, cats] = await Promise.all([
          query.order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
          namesIn(ctx),
          getCategories(ctx.org.id, { includeArchived: true }),
        ]);
        if (error) throw new Error(error.message);
        type Row = Expense & { expense_shares: Pick<ExpenseShare, "person_id" | "amount">[] };
        const rows = (data ?? []) as Row[];
        const copayers = await getExpenseCopayers(ctx.org.id, rows.map((e) => e.id));
        const catLabel = new Map(cats.map((c) => [c.key, c.label]));
        const me = ctx.member.id;

        const out = rows
          .map((e) => {
            const paid = paidByEach(Number(e.amount), e.paid_by, copayers.get(e.id) ?? []);
            const share = Number(e.expense_shares.find((s) => s.person_id === me)?.amount ?? 0);
            return { e, paid, share, involved: paid.has(me) || e.expense_shares.some((s) => s.person_id === me) };
          })
          .filter((x) => everyone || x.involved)
          .slice(0, max)
          .map(({ e, paid, share }) => ({
            id: e.id,
            date: e.expense_date,
            title: e.title,
            category: catLabel.get(e.category) ?? e.category,
            amount: Number(e.amount),
            paid_by: [...paid].map(([id, amount]) => ({ name: nameOf(id), amount })),
            split: e.bill ? "by item" : e.split_type,
            people: e.expense_shares.length,
            your_share: share,
            your_net: round2((paid.get(me) ?? 0) - share),
            meal: e.meal_date ? `${e.meal} on ${e.meal_date}` : undefined,
          }));
        return {
          group: ctx.org.name,
          currency: ctx.org.currency,
          from: start ?? "any",
          to: end ?? "any",
          showing: everyone ? "everyone" : "involving you",
          count: out.length,
          total: round2(out.reduce((s, x) => s + x.amount, 0)),
          expenses: out,
          note: "your_net: + you lent this much on it, - you owe this much for it. Meal orders aren't expenses; see my_history.",
        };
      }),
  );

  server.registerTool(
    "get_expense",
    {
      title: "One expense in detail",
      description: "Everything about one expense: who paid, how it was split and each person's share, the bill's items, and the note.",
      inputSchema: { group, expense_id: z.string().describe("The expense id from list_expenses") },
      annotations: READ_ONLY,
    },
    ({ group: slug, expense_id }) =>
      run(async () => {
        if (!UUID.test(expense_id)) throw new ToolError("That isn't an expense id. Use an id from list_expenses.");
        const ctx = await member(slug);
        const [{ data }, nameOf, cats, copayers] = await Promise.all([
          orgDb(ctx.org.id).select("expenses", "*, expense_shares(person_id, amount)").eq("id", expense_id).maybeSingle(),
          namesIn(ctx),
          getCategories(ctx.org.id, { includeArchived: true }),
          getExpenseCopayers(ctx.org.id, [expense_id]),
        ]);
        if (!data) throw new ToolError("No such expense in this group.");
        const e = data as Expense & { expense_shares: Pick<ExpenseShare, "person_id" | "amount">[] };
        const paid = paidByEach(Number(e.amount), e.paid_by, copayers.get(e.id) ?? []);
        const bill = e.bill as Bill | null | undefined;
        let budget: string | null = null;
        if (e.budget_id) {
          const { data: b } = await orgDb(ctx.org.id).select("budgets", "name").eq("id", e.budget_id).maybeSingle();
          budget = (b as { name: string } | null)?.name ?? null;
        }
        return {
          id: e.id,
          group: ctx.org.name,
          currency: ctx.org.currency,
          title: e.title,
          date: e.expense_date,
          category: cats.find((c) => c.key === e.category)?.label ?? e.category,
          amount: Number(e.amount),
          paid_by: [...paid].map(([id, amount]) => ({ name: nameOf(id), amount })),
          split: bill ? "by item" : e.split_type,
          shares: e.expense_shares
            .map((s) => ({ name: nameOf(s.person_id), amount: Number(s.amount) }))
            .sort((a, b) => b.amount - a.amount),
          bill: bill
            ? {
                items: bill.items.map((i) => ({ name: i.name, amount: i.amount, shared_by: i.people.map(nameOf) })),
                extras: bill.extras,
                note: "Tax, charges and discounts are shared in proportion to each person's items.",
              }
            : undefined,
          meal: e.meal_date ? `${e.meal} on ${e.meal_date}` : undefined,
          budget,
          note: e.note,
          added_by: nameOf(e.created_by),
          added_at: e.created_at,
        };
      }),
  );

  server.registerTool(
    "my_history",
    {
      title: "My history in a group",
      description:
        "Every line behind the person's balance in one group: expense shares, meal orders, SMS fees and payments. Give with_member_id (from group_balances) to see only what is between the person and one other member. Defaults to the last 60 days.",
      inputSchema: {
        group,
        from: date.optional(),
        to: date.optional(),
        with_member_id: z.string().optional().describe("Only lines between the person and this member"),
      },
      annotations: READ_ONLY,
    },
    ({ group: slug, from, to, with_member_id }) =>
      run(async () => {
        checkRange(from, to, 400);
        if (with_member_id && !UUID.test(with_member_id)) throw new ToolError("That isn't a member id. Use a member_id from group_balances.");
        const ctx = await member(slug);
        const me = ctx.member.id;
        const end = to ?? todayColombo();
        const start = from ?? addDays(end, -60);
        const nameOf = await namesIn(ctx);
        let rows: LedgerRow[];
        if (with_member_id) {
          if (with_member_id === me) throw new ToolError("That's the person themselves. Pick someone else.");
          rows = (await getLedgerBetween(ctx.org.id, me, with_member_id)).filter((r) => r.entry_date >= start && r.entry_date <= end);
        } else {
          rows = await getLedgerFor(ctx.org.id, me, { from: start, to: end, limit: 300 });
        }
        const lines = rows.map((r) => ({
          date: r.entry_date,
          what: r.label,
          kind: r.source,
          with: nameOf(r.creditor === me ? r.debtor : r.creditor),
          amount: signedFor(me, r),
        }));
        return {
          group: ctx.org.name,
          currency: ctx.org.currency,
          from: start,
          to: end,
          with: with_member_id ? nameOf(with_member_id) : "everyone",
          lines,
          sum_of_these_lines: round2(lines.reduce((s, l) => s + l.amount, 0)),
          note: "+ they owe you, - you owe them. A payment shows as the opposite of a debt. This sum is only these lines; for what to pay now use group_balances.",
        };
      }),
  );

  server.registerTool(
    "across_groups",
    {
      title: "Balances across all groups",
      description:
        "Each person the caller has a balance with, added up over every group they share (the same person is matched by account, or by mobile/email for guests). Amounts in different currencies are kept apart.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      run(async () => {
        const people = await getAcrossGroups(profile.id);
        return {
          people: people.map((p) => ({
            name: p.name,
            currency: p.currency,
            net: p.net,
            in_groups: p.lines.map((l) => ({ group: l.org.slug, name: l.org.name, amount: l.amount })),
          })),
          note: "+ they owe you overall, - you owe them. Payments are still made inside each group.",
        };
      }),
  );

  server.registerTool(
    "me_spending",
    {
      title: "My personal spending",
      description:
        "What the person spent (Me, private to them): their own entries plus their share of group expenses, meal orders and SMS fees. Defaults to this month so far.",
      inputSchema: { from: date.optional(), to: date.optional() },
      annotations: READ_ONLY,
    },
    ({ from, to }) =>
      run(async () => {
        checkRange(from, to, 366);
        const today = todayColombo();
        const end = to ?? today;
        const start = from ?? startOfMonth(end);
        const [rows, { data: cats }] = await Promise.all([
          getSpendByMonth(profile.id, start, end),
          meDb(profile.id).select("personal_categories", "key, label"),
        ]);
        const label = new Map(((cats ?? []) as { key: string; label: string }[]).map((c) => [c.key, c.label]));
        const counted = rows.filter((r) => r.counted);
        const byCat = new Map<string, number>();
        for (const r of counted) byCat.set(r.category, round2((byCat.get(r.category) ?? 0) + r.amount));
        return {
          currency: profile.currency ?? "LKR",
          from: start,
          to: end,
          total: round2(counted.reduce((s, r) => s + r.amount, 0)),
          by_category: [...byCat]
            .sort((a, b) => b[1] - a[1])
            .map(([k, amount]) => ({ category: label.get(k) ?? k, amount })),
          entries: rows.slice(0, 150).map((r) => ({
            date: r.spent_on,
            title: r.title,
            amount: r.amount,
            category: label.get(r.category) ?? r.category,
            from: r.source === "manual" ? "own entry" : `${r.org_name ?? "a group"} (${r.source})`,
            counted: r.counted ? undefined : `not counted: ${r.currency}`,
          })),
          more_entries: Math.max(0, rows.length - 150),
          note: "Only what the person consumed. What they paid for others is owed back to them inside the group, not spending.",
        };
      }),
  );

  server.registerTool(
    "me_budgets",
    {
      title: "My budgets",
      description:
        "The person's personal budgets (Me) as of today: limit, spent, left, and how much is safe to spend today and per day.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      run(async () => {
        const today = todayColombo();
        const budgets = await getBudgets(profile.id);
        if (!budgets.length) return { currency: profile.currency ?? "LKR", budgets: [], note: "No budgets yet. They are set up in Me › Budgets in the app." };
        const win = spendWindow(budgets, today, profile.payday);
        const rows = await getSpendByMonth(profile.id, win.start, win.end);
        return {
          currency: profile.currency ?? "LKR",
          today,
          budgets: budgets.map((b) => {
            const s = budgetStatus(b, rows, today, profile.payday);
            return {
              name: b.name,
              main: b.is_main,
              period: b.period,
              from: s.range.start,
              to: s.range.end,
              state: s.state,
              limit: s.limit,
              carried_over: s.carry || undefined,
              spent: s.spent,
              left: s.left,
              safe_to_spend_today: s.state === "active" ? s.safeToday : undefined,
              per_day_from_today: s.state === "active" ? s.perDay : undefined,
              days_left: s.daysLeft,
              projected_at_end: s.projected,
              categories: b.categories ?? "all spending",
            };
          }),
        };
      }),
  );

  return server;
}
