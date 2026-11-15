import Link from "next/link";
import { CaretLeft, CaretRight, ChartBar, DownloadSimple } from "@phosphor-icons/react/ssr";
import { requireMember } from "@/lib/auth";
import { listMembers } from "@/lib/ledger";
import { getCategories } from "@/lib/org-config";
import { getExpenseCopayers, paidByEach } from "@/lib/payers";
import { MEALS_KEY, monthsSpend, spendEntries, type SpendExpense } from "@/lib/group-spend";
import { analyse, groupTips, monthList, monthName } from "@/lib/insights";
import { addDays, fmtMonth, todayColombo } from "@/lib/time";
import { round2, rs } from "@/lib/types";
import { EmptyState, PageHeader } from "@/components/bits";
import { InsightsView } from "@/components/insights-view";

const SPAN = 6;

export default async function InsightsPage(props: PageProps<"/g/[slug]/insights">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  const { org, member: me, base } = ctx;
  const sp = await props.searchParams;
  const today = todayColombo();
  const thisMonth = today.slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const prevMonth = addDays(`${month}-01`, -1).slice(0, 7);
  const nextMonth = addDays(`${month}-28`, 4).slice(0, 7);
  const meals = ctx.settings.meals_enabled;

  // Six months: the one being looked at, and the five before it for the trend and "the usual".
  const months = monthList(month, SPAN);
  const [data, people, cats] = await Promise.all([
    monthsSpend(org.id, months, meals, today),
    listMembers(org.id, { includeInactive: true }),
    getCategories(org.id, { includeArchived: true }),
  ]);
  const now = data[data.length - 1];
  const copayers = await getExpenseCopayers(org.id, now.expenses.map((e) => e.id));
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const catOf = new Map(cats.map((c) => [c.key, c]));
  const shareOf = (e: SpendExpense) => Number(e.expense_shares.find((s) => s.person_id === me.id)?.amount ?? 0);

  // Totals: the group's, my share of it, and what each person paid out of pocket.
  const byCat = new Map<string, { total: number; mine: number }>();
  const paid = new Map<string, number>();
  const add = (cat: string, total: number, mine: number) => {
    const c = byCat.get(cat) ?? { total: 0, mine: 0 };
    byCat.set(cat, { total: c.total + total, mine: c.mine + mine });
  };
  for (const e of now.expenses) {
    add(e.category, Number(e.amount), shareOf(e));
    for (const [id, amt] of paidByEach(Number(e.amount), e.paid_by, copayers.get(e.id) ?? [])) paid.set(id, (paid.get(id) ?? 0) + amt);
  }
  for (const o of now.orders) {
    const cost = Number(o.unit_price) * o.qty;
    add(MEALS_KEY, cost, o.person_id === me.id ? cost : 0);
    if (o.payee_id) paid.set(o.payee_id, (paid.get(o.payee_id) ?? 0) + cost);
  }
  const iPaid = round2(paid.get(me.id) ?? 0);

  const { everyone, mine: myPart } = spendEntries(data, me.id);
  const a = analyse(everyone, { month, today, span: SPAN });
  const mineA = analyse(myPart, { month, today, span: SPAN });
  const mine = mineA.total;

  const categories = [...byCat.entries()].map(([key, v]) => ({ key, ...v })).sort((x, y) => y.total - x.total);
  const payers = [...paid.entries()]
    .map(([id, amount]) => ({ id, name: id === me.id ? "You" : (names.get(id) ?? "Someone"), amount: round2(amount) }))
    .sort((x, y) => y.amount - x.amount);
  const biggest = [...now.expenses].sort((x, y) => Number(y.amount) - Number(x.amount)).slice(0, 5);
  const label = (key: string) => (key === MEALS_KEY ? "Meal orders" : (catOf.get(key)?.label ?? "Other"));
  const monthLong = fmtMonth(`${month}-01`);
  const tips = groupTips(a, { fmt: rs, label, base, mine, iPaid, payers, otherKey: "other" });
  const anything = a.months.some((m) => m.total > 0);

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
            <span className="min-w-32 text-center text-sm font-semibold">{month === thisMonth ? "This month" : monthLong}</span>
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

      {!anything ? (
        <EmptyState icon={ChartBar} title={`Nothing spent in ${monthLong}`} body="Expenses and meal orders from this month will show up here." />
      ) : (
        <InsightsView
          base={base}
          monthLabel={monthLong}
          a={a}
          mine={mine}
          mineUsual={mineA.usual}
          iPaid={iPaid}
          tips={tips}
          trend={a.months.map((m, i) => ({
            month: m.month,
            label: monthName(m.month, "short"),
            name: monthName(m.month, "long", true),
            total: m.total,
            mine: mineA.months[i].total,
            href: `${base}/insights${m.month === thisMonth ? "" : `?month=${m.month}`}`,
          }))}
          categories={categories.map((c) => ({
            key: c.key,
            label: label(c.key),
            icon: c.key === MEALS_KEY ? "fork-knife" : catOf.get(c.key)?.icon,
            total: round2(c.total),
            mine: round2(c.mine),
          }))}
          payers={payers}
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
      {now.expenses.length > 0 && (
        <p className="text-center">
          {/* A plain link: a file download from a route handler, not a page. */}
          <a href={`${base}/export?type=expenses&month=${month}`} download className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
            <DownloadSimple size={15} aria-hidden="true" /> Download {monthLong} expenses (CSV)
          </a>
        </p>
      )}
    </div>
  );
}
