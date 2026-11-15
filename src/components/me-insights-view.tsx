import Link from "next/link";
import { money } from "@/lib/currency";
import { monthName, pct, tidy, type Analysis, type Tip } from "@/lib/insights";
import type { PCategory, SpendRow } from "@/lib/personal";
import { fmtDay } from "@/lib/time";
import { round2 } from "@/lib/types";
import { Columns, Delta, Segmented, TipList } from "@/components/insight-bits";
import { CatIcon, SpendList } from "@/components/me-bits";

type Props = {
  a: Analysis;
  tips: Tip[];
  categories: PCategory[];
  currency: string;
  /** the biggest entries of the month, biggest first */
  biggest: SpendRow[];
  /** link to this page for another month, keeping the other choices */
  monthHref: (month: string) => string;
  /** link to Spending for one category of this month */
  categoryHref: (key: string) => string;
  span: { six: string; twelve: string; value: number };
};

/** Me › Insights for one month: headline numbers, tips, the trend, categories, days and habits. */
export function MeInsightsView({ a, tips, categories, currency, biggest, monthHref, categoryHref, span }: Props) {
  const fmt = (n: number) => money(n, currency);
  const cats = new Map(categories.map((c) => [c.key, c]));
  const shown = a.categories.filter((c) => c.amount > 0);
  const maxCat = Math.max(...shown.map((c) => c.amount), 1);
  const name = monthName(a.month);
  const busiest = [...a.weekdays].sort((x, y) => y.avg - x.avg)[0];

  return (
    <>
      <section className="card grid grid-cols-3 divide-x divide-line p-0 text-sm">
        <Stat label={a.current ? "Spent so far" : "Spent"} value={fmt(Math.round(a.total))}>
          <Delta now={a.total} usual={a.usual} />
        </Stat>
        <Stat label="A day" value={fmt(Math.round(a.perDay))} note={`over ${a.elapsed} days`} />
        {a.current ? (
          <Stat
            label="On pace for"
            value={a.projected ? fmt(Math.round(a.projected)) : "–"}
            note={a.projected ? `by the end of ${name}` : "Too early to say"}
          />
        ) : (
          <Stat
            label="Biggest day"
            value={a.topDay ? fmt(Math.round(a.topDay.total)) : "–"}
            note={a.topDay ? fmtDay(a.topDay.date) : undefined}
          />
        )}
      </section>

      {tips.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Worth knowing</h2>
          <TipList tips={tips} />
        </section>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Month by month</h2>
            <p className="text-xs text-muted">Tap a month to look at it.</p>
          </div>
          <Segmented
            label="How far back"
            options={[
              { href: span.six, label: "6 months", on: span.value === 6 },
              { href: span.twelve, label: "12 months", on: span.value === 12 },
            ]}
          />
        </div>
        <Columns
          label="Spending month by month"
          dense={a.months.length > 6}
          items={a.months.map((m) => ({
            key: m.month,
            label: monthName(m.month, "short"),
            value: m.total,
            title: `${monthName(m.month, "long", true)}: ${fmt(m.total)}`,
            href: monthHref(m.month),
            selected: m.month === a.month,
          }))}
        />
      </section>

      {shown.length > 0 && (
        <section className="card space-y-4">
          <div>
            <h2 className="font-semibold">By category</h2>
            {a.usual !== null && (
              <p className="text-xs text-muted">
                Compared with what you usually spend {a.current ? `by day ${a.elapsed} of a month` : "in a month"}.
              </p>
            )}
          </div>
          <ul className="space-y-3">
            {shown.map((c) => {
              const diff = c.usual === null ? null : round2(c.amount - c.usual);
              const same = diff !== null && Math.abs(diff) < Math.max(c.usual ?? 0, c.amount) * 0.05;
              return (
                <li key={c.key}>
                  <Link href={categoryHref(c.key)} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-surface-2">
                    <CatIcon icon={cats.get(c.key)?.icon} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{cats.get(c.key)?.label ?? "Other"}</span>
                        <span className="shrink-0 tabular-nums">
                          <b>{fmt(c.amount)}</b>
                          <span className="text-muted"> · {pct(c.amount, a.total)}%</span>
                        </span>
                      </div>
                      <div
                        className="h-2 rounded-[4px] bg-brand"
                        style={{ width: `${Math.max((c.amount / maxCat) * 100, 2)}%` }}
                        aria-hidden="true"
                      />
                      {diff !== null && (
                        <p className={`text-xs tabular-nums ${same || !c.usual ? "text-muted" : diff > 0 ? "text-amber-ink" : "text-brand-strong"}`}>
                          {!c.usual
                            ? "Nothing here in the months before"
                            : same
                              ? "About the same as usual"
                              : `${fmt(tidy(Math.abs(diff)))} ${diff > 0 ? "more" : "less"} than usual`}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {a.total > 0 && a.elapsed >= 7 && (
        <section className="card space-y-3">
          <div>
            <h2 className="font-semibold">By day of the week</h2>
            <p className="text-xs text-muted">
              What an average day cost {a.current ? "so far this month" : `in ${name}`}.
              {busiest && busiest.avg > 0 ? ` ${busiest.label}s cost the most.` : ""}
            </p>
          </div>
          <Columns
            label="Average spending by day of the week"
            items={a.weekdays.map((d) => ({
              key: d.label,
              label: d.label.slice(0, 3),
              value: d.avg,
              title: `${d.label}: about ${fmt(Math.round(d.avg))} a day`,
            }))}
          />
          <p className="text-xs text-muted">
            {a.noSpendDays > 0
              ? `${a.noSpendDays} of ${a.elapsed} days had nothing spent.`
              : `Something was spent on every one of the ${a.elapsed} days.`}
          </p>
        </section>
      )}

      {a.repeats.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Most often</h2>
          <ul className="card divide-y divide-line py-1">
            {a.repeats.map((r) => (
              <li key={r.title} className="flex items-center gap-3 py-2.5">
                <CatIcon icon={cats.get(r.category)?.icon} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  <p className="text-xs text-muted tabular-nums">
                    {r.count} times · about {fmt(Math.round(r.total / r.count))} each
                  </p>
                </div>
                <b className="text-sm tabular-nums">{fmt(r.total)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {biggest.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Biggest</h2>
          <div className="card py-1">
            <SpendList rows={biggest} categories={categories} currency={currency} />
          </div>
        </section>
      )}
    </>
  );
}

function Stat({ label, value, note, children }: { label: string; value: string; note?: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-4 sm:px-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums sm:text-lg">{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-tight text-muted">{note}</p>}
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}
