import Link from "next/link";
import { CaretLeft, CaretRight, ChartBar } from "@phosphor-icons/react/ssr";
import { requireMember } from "@/lib/auth";
import { listMembers } from "@/lib/ledger";
import { getCategories } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { getExpenseCopayers, paidByEach } from "@/lib/payers";
import { addDays, daysInMonth, fmtMonth, todayColombo } from "@/lib/time";
import { round2 } from "@/lib/types";
import { EmptyState, PageHeader } from "@/components/bits";
import { InsightsView } from "@/components/insights-view";

type ExpenseRow = {
  id: string;
  title: string;
  amount: number;
  category: string;
  paid_by: string;
  expense_date: string;
  expense_shares: { person_id: string; amount: number }[];
};
type OrderRow = { person_id: string; unit_price: number; qty: number; payee_id: string | null };

/** PostgREST returns at most 1000 rows a request; a busy office month of meal orders can pass that. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data } = await page(from, from + 999);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** What the group spent in one month: every expense, plus meal orders when the group uses meals. */
async function monthData(orgId: string, month: string, meals: boolean) {
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(from)).padStart(2, "0")}`;
  const db = orgDb(orgId);
  const [expenses, orders] = await Promise.all([
    all<ExpenseRow>((a, b) =>
      db
        .select("expenses", "id, title, amount, category, paid_by, expense_date, expense_shares(person_id, amount)")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false })
        .order("id")
        .range(a, b),
    ),
    meals
      ? all<OrderRow>((a, b) =>
          db.select("orders", "person_id, unit_price, qty, payee_id").gte("order_date", from).lte("order_date", to).order("id").range(a, b),
        )
      : Promise.resolve([] as OrderRow[]),
  ]);
  return { expenses, orders };
}

const MEALS_KEY = "__meal_orders";

export default async function InsightsPage(props: PageProps<"/g/[slug]/insights">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  const { org, member: me, base } = ctx;
  const sp = await props.searchParams;
  const thisMonth = todayColombo().slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const prevMonth = addDays(`${month}-01`, -1).slice(0, 7);
  const nextMonth = addDays(`${month}-28`, 4).slice(0, 7);
  const meals = ctx.settings.meals_enabled;

  const [now, before, people, cats] = await Promise.all([
    monthData(org.id, month, meals),
    monthData(org.id, prevMonth, meals),
    listMembers(org.id, { includeInactive: true }),
    getCategories(org.id, { includeArchived: true }),
  ]);
  const copayers = await getExpenseCopayers(org.id, now.expenses.map((e) => e.id));
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const catOf = new Map(cats.map((c) => [c.key, c]));

  // Totals: the group's, my share of it, and what each person paid out of pocket.
  const byCat = new Map<string, { total: number; mine: number }>();
  const paid = new Map<string, number>();
  const add = (cat: string, total: number, mine: number) => {
    const c = byCat.get(cat) ?? { total: 0, mine: 0 };
    byCat.set(cat, { total: c.total + total, mine: c.mine + mine });
  };
  for (const e of now.expenses) {
    add(e.category, Number(e.amount), Number(e.expense_shares.find((s) => s.person_id === me.id)?.amount ?? 0));
    for (const [id, amt] of paidByEach(Number(e.amount), e.paid_by, copayers.get(e.id) ?? [])) paid.set(id, (paid.get(id) ?? 0) + amt);
  }
  for (const o of now.orders) {
    const cost = Number(o.unit_price) * o.qty;
    add(MEALS_KEY, cost, o.person_id === me.id ? cost : 0);
    if (o.payee_id) paid.set(o.payee_id, (paid.get(o.payee_id) ?? 0) + cost);
  }
  const total = round2([...byCat.values()].reduce((s, c) => s + c.total, 0));
  const mine = round2([...byCat.values()].reduce((s, c) => s + c.mine, 0));
  const iPaid = round2(paid.get(me.id) ?? 0);
  const totalBefore = round2(
    before.expenses.reduce((s, e) => s + Number(e.amount), 0) + before.orders.reduce((s, o) => s + Number(o.unit_price) * o.qty, 0),
  );
  const mineBefore = round2(
    before.expenses.reduce((s, e) => s + Number(e.expense_shares.find((x) => x.person_id === me.id)?.amount ?? 0), 0) +
      before.orders.filter((o) => o.person_id === me.id).reduce((s, o) => s + Number(o.unit_price) * o.qty, 0),
  );

  const categories = [...byCat.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total);
  const payers = [...paid.entries()].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);
  const biggest = [...now.expenses].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
  const label = (key: string) => (key === MEALS_KEY ? "Meal orders" : (catOf.get(key)?.label ?? "Other"));
  const monthName = fmtMonth(`${month}-01`);
  const prevName = fmtMonth(`${prevMonth}-01`).split(" ")[0];

  return (
    <div className="stagger mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Insights"
        sub={`Where ${org.name}'s money went`}
        action={
          <div className="flex items-center gap-1">
            <Link href={`${base}/insights?month=${prevMonth}`} className="btn-ghost size-9 min-h-0 p-0" aria-label="Previous month">
              <CaretLeft size={18} aria-hidden="true" />
            </Link>
            <span className="min-w-32 text-center text-sm font-semibold">{month === thisMonth ? "This month" : monthName}</span>
            {month < thisMonth ? (
              <Link href={`${base}/insights?month=${nextMonth}`} className="btn-ghost size-9 min-h-0 p-0" aria-label="Next month">
                <CaretRight size={18} aria-hidden="true" />
              </Link>
            ) : (
              <span className="size-9" aria-hidden="true" />
            )}
          </div>
        }
      />

      {total === 0 ? (
        <EmptyState icon={ChartBar} title={`Nothing spent in ${monthName}`} body="Expenses and meal orders from this month will show up here." />
      ) : (
        <InsightsView
          base={base}
          total={total}
          mine={mine}
          iPaid={iPaid}
          totalNote={change(total, totalBefore, prevName)}
          mineNote={change(mine, mineBefore, prevName)}
          categories={categories.map((c) => ({
            key: c.key,
            label: label(c.key),
            icon: c.key === MEALS_KEY ? "fork-knife" : catOf.get(c.key)?.icon,
            total: round2(c.total),
            mine: round2(c.mine),
          }))}
          payers={payers.map((p) => ({ id: p.id, name: p.id === me.id ? "You" : (names.get(p.id) ?? "Someone"), amount: round2(p.amount) }))}
          biggest={biggest.map((e) => ({
            id: e.id,
            title: e.title,
            date: e.expense_date,
            icon: catOf.get(e.category)?.icon,
            payer: e.paid_by === me.id ? "You" : (names.get(e.paid_by)?.split(" ")[0] ?? "Someone"),
            amount: Number(e.amount),
          }))}
        />
      )}
    </div>
  );
}

/** "12% more than October", or nothing when last month was empty or about the same. */
function change(now: number, before: number, prevName: string) {
  if (before <= 0) return undefined;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return `Same as ${prevName}`;
  return `${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} than ${prevName}`;
}
