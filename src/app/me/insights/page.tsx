import Link from "next/link";
import type { Metadata } from "next";
import { CaretLeft, CaretRight, ChartLineUp } from "@phosphor-icons/react/ssr";
import { money } from "@/lib/currency";
import { analyse, meTips, monthList, monthName, type Entry } from "@/lib/insights";
import { endOfMonth } from "@/lib/periods";
import { budgetStatus, getBudgets, getMe, getSpendByMonth, spendWindow } from "@/lib/personal";
import { todayColombo } from "@/lib/time";
import { EmptyState, PageHeader } from "@/components/bits";
import { Segmented } from "@/components/insight-bits";
import { MeInsightsView } from "@/components/me-insights-view";

export const metadata: Metadata = { title: "Insights" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SOURCES = ["all", "own", "groups"] as const;
type Source = (typeof SOURCES)[number];

/** Me › Insights: one month of your spending against your own usual, with tips. Rules only, no AI. */
export default async function MeInsights(props: PageProps<"/me/insights">) {
  const sp = await props.searchParams;
  const { profile, currency, categories } = await getMe();
  const today = todayColombo();
  const thisMonth = today.slice(0, 7);
  const m = typeof sp.m === "string" && MONTH.test(sp.m) && sp.m <= thisMonth ? sp.m : thisMonth;
  const src: Source = SOURCES.find((s) => s === sp.src) ?? "all";
  const span = sp.span === "12" ? 12 : 6;
  const months = monthList(m, span);
  const [prev] = monthList(m, 2);
  const next = nextMonth(m);

  // Budgets only come into the tips for the month that is running, looking at all spending.
  const budgets = m === thisMonth && src === "all" ? await getBudgets(profile.id) : null;
  const main = budgets?.find((b) => b.is_main);
  const win = budgets?.length ? spendWindow(budgets, today, profile.payday) : null;
  const first = `${months[0]}-01`;
  const last = endOfMonth(`${m}-01`);
  const from = win && win.start < first ? win.start : first;
  const to = win && win.end > last ? win.end : last;
  const rows = await getSpendByMonth(profile.id, from, to);

  const counted = rows.filter((r) => r.counted && (src === "all" || (src === "own") === (r.source === "manual")));
  const entries: Entry[] = counted.map((r) => ({
    date: r.spent_on,
    amount: r.amount,
    category: r.category,
    title: r.title,
    own: r.source === "manual",
  }));
  const a = analyse(entries, { month: m, today, span });
  const status = main ? budgetStatus(main, rows, today, profile.payday) : null;
  const label = new Map(categories.map((c) => [c.key, c.label]));

  const link = (q: { m?: string; src?: Source; span?: number }) => {
    const p = new URLSearchParams();
    const mm = q.m ?? m;
    if (mm !== thisMonth) p.set("m", mm);
    const s = q.src ?? src;
    if (s !== "all") p.set("src", s);
    if ((q.span ?? span) === 12) p.set("span", "12");
    const qs = p.toString();
    return `/me/insights${qs ? `?${qs}` : ""}`;
  };
  const categoryHref = (key: string) => `/me/spending?${new URLSearchParams({ ...(m !== thisMonth ? { m } : {}), c: key })}`;

  const tips = meTips(a, {
    fmt: (n) => money(n, currency),
    label: (k) => label.get(k) ?? "Other",
    categoryHref,
    budget: !budgets
      ? undefined
      : main && status?.state === "active"
        ? { id: main.id, name: main.name, limit: status.limit, left: status.left, projected: status.projected, perDay: status.perDay, daysLeft: status.daysLeft }
        : main
          ? undefined
          : null,
    income: profile.monthly_income,
    whole: src === "all",
  });
  const biggest = counted
    .filter((r) => r.spent_on.slice(0, 7) === m && r.spent_on <= today)
    .sort((x, y) => y.amount - x.amount)
    .slice(0, 5);
  const foreign = rows.filter((r) => !r.counted && r.spent_on.slice(0, 7) === m).length;
  const hasGroups = rows.some((r) => r.org_id);
  const anything = a.months.some((x) => x.total > 0);

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title="Insights"
        sub="How this month compares with your usual, and what stands out"
        action={
          <div className="flex items-center gap-1">
            <Link href={link({ m: prev })} className="btn-ghost size-9 min-h-0 p-0" aria-label="Previous month">
              <CaretLeft size={18} aria-hidden="true" />
            </Link>
            <span className="min-w-32 text-center text-sm font-semibold">{m === thisMonth ? "This month" : monthName(m, "long", true)}</span>
            {m < thisMonth ? (
              <Link href={link({ m: next })} className="btn-ghost size-9 min-h-0 p-0" aria-label="Next month">
                <CaretRight size={18} aria-hidden="true" />
              </Link>
            ) : (
              <span className="size-9" aria-hidden="true" />
            )}
          </div>
        }
      />

      {hasGroups && (
        <Segmented
          label="Which spending"
          options={[
            { href: link({ src: "all" }), label: "Everything", on: src === "all" },
            { href: link({ src: "own" }), label: "Just mine", on: src === "own" },
            { href: link({ src: "groups" }), label: "From groups", on: src === "groups" },
          ]}
        />
      )}

      {!anything ? (
        <EmptyState
          icon={ChartLineUp}
          title="Nothing to look at yet"
          body="Add what you spend for a few days and this page starts showing where it goes and how it changes."
          action={
            <Link href="/me/add" className="btn-primary">
              Add spending
            </Link>
          }
        />
      ) : (
        <MeInsightsView
          a={a}
          tips={tips}
          categories={categories}
          currency={currency}
          biggest={biggest}
          monthHref={(month) => link({ m: month })}
          categoryHref={categoryHref}
          span={{ six: link({ span: 6 }), twelve: link({ span: 12 }), value: span }}
        />
      )}

      {foreign > 0 && (
        <p className="text-center text-xs text-muted">
          {foreign} group {foreign === 1 ? "entry" : "entries"} in another currency {foreign === 1 ? "isn't" : "aren't"} counted here.
        </p>
      )}
      <p className="text-center text-xs text-muted">Only you can see this. It&apos;s worked out from what you&apos;ve recorded, by fixed rules.</p>
    </div>
  );
}

function nextMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
