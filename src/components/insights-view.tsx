import Link from "next/link";
import { fmtDay } from "@/lib/time";
import { round2, rs } from "@/lib/types";
import type { Analysis, Tip } from "@/lib/insights";
import { Avatar, CategoryIcon } from "@/components/bits";
import { Columns, Delta, ShareLegend, TipList } from "@/components/insight-bits";

type Props = {
  base: string;
  /** "November 2026" */
  monthLabel: string;
  /** everything the group spent, analysed (lib/insights.ts) */
  a: Analysis;
  mine: number;
  /** what my share usually is by this point of a month; null with nothing to compare */
  mineUsual: number | null;
  iPaid: number;
  tips: Tip[];
  /** oldest first, ending with the month being looked at */
  trend: { month: string; label: string; name: string; total: number; mine: number; href: string }[];
  /** biggest first */
  categories: { key: string; label: string; icon?: string | null; total: number; mine: number }[];
  /** biggest first; name is "You" for the viewer */
  payers: { id: string; name: string; amount: number }[];
  biggest: { id: string; title: string; date: string; icon?: string | null; payer: string; amount: number }[];
};

/** One month of a group's spending: headline numbers, tips, the trend, by category, who paid, biggest. */
export function InsightsView({ base, monthLabel, a, mine, mineUsual, iPaid, tips, trend, categories, payers, biggest }: Props) {
  const total = a.total;
  const maxCat = Math.max(...categories.map((c) => c.total), 1);
  const shownPayers = payers.slice(0, 6);
  const otherPayers = payers.slice(6);
  const maxPaid = Math.max(...payers.map((p) => p.amount), 1);
  const busiest = [...a.weekdays].sort((x, y) => y.avg - x.avg)[0];
  return (
        <>
          <section className="card grid grid-cols-3 divide-x divide-line p-0 text-sm">
            <Stat label="Group spent" value={total}>
              <Delta now={total} usual={a.usual} />
            </Stat>
            <Stat label="Your share" value={mine}>
              <Delta now={mine} usual={mineUsual} />
            </Stat>
            <Stat label="You paid" value={iPaid} note={iPaid > mine ? `${rs(round2(iPaid - mine))} for others` : undefined} />
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
              <ShareLegend />
            </div>
            <Columns
              label="Group spending month by month"
              items={trend.map((m) => ({
                key: m.month,
                label: m.label,
                value: m.total,
                part: m.mine,
                title: `${m.name}: ${rs(m.total)}, your share ${rs(m.mine)}`,
                href: m.href,
                selected: m.month === a.month,
              }))}
            />
          </section>

          {total === 0 && (
            <p className="card text-center text-sm text-muted">Nothing was spent in {monthLabel}.</p>
          )}

          {categories.length > 0 && (
          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">By category</h2>
              <ShareLegend />
            </div>
            <ul className="space-y-4">
              {categories.map((c) => {
                const rest = round2(c.total - c.mine);
                return (
                  <li key={c.key} className="flex items-center gap-3">
                    <CategoryIcon icon={c.icon} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{c.label}</span>
                        <span className="shrink-0 tabular-nums">
                          <b>{rs(round2(c.total))}</b>
                          <span className="text-muted"> · {Math.round((c.total / total) * 100)}%</span>
                        </span>
                      </div>
                      {/* One bar per category on a shared scale; a 2px gap separates your part from the rest. */}
                      <div className="flex h-2 gap-0.5" style={{ width: `${Math.max((c.total / maxCat) * 100, 2)}%` }}>
                        {c.mine > 0 && (
                          <span className="rounded-[4px] bg-brand" style={{ flexGrow: c.mine, flexBasis: 0, minWidth: 3 }} title={`Your share: ${rs(round2(c.mine))}`} />
                        )}
                        {rest > 0 && (
                          <span className="rounded-[4px] bg-muted/40" style={{ flexGrow: rest, flexBasis: 0, minWidth: 3 }} title={`Everyone else: ${rs(rest)}`} />
                        )}
                      </div>
                      <p className="text-xs text-muted tabular-nums">{c.mine > 0 ? `Your share ${rs(round2(c.mine))}` : "None of it was yours"}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          )}

          {total > 0 && a.elapsed >= 7 && (
            <section className="card space-y-3">
              <div>
                <h2 className="font-semibold">By day of the week</h2>
                <p className="text-xs text-muted">
                  What the group spent on an average day {a.current ? "so far this month" : `in ${monthLabel}`}.
                  {busiest && busiest.avg > 0 ? ` ${busiest.label}s cost the most.` : ""}
                </p>
              </div>
              <Columns
                label="Average group spending by day of the week"
                items={a.weekdays.map((d) => ({
                  key: d.label,
                  label: d.label.slice(0, 3),
                  value: d.avg,
                  title: `${d.label}: about ${rs(Math.round(d.avg))} a day`,
                }))}
              />
            </section>
          )}

          {payers.length > 0 && (
            <section className="card space-y-4">
              <div>
                <h2 className="font-semibold">Who paid</h2>
                <p className="text-xs text-muted">Money each person put in up front, before it was split.</p>
              </div>
              <ul className="space-y-3">
                {shownPayers.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Avatar name={p.name} size={32} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{p.name}</span>
                        <b className="shrink-0 tabular-nums">{rs(round2(p.amount))}</b>
                      </div>
                      <div
                        className="h-2 rounded-[4px] bg-brand"
                        style={{ width: `${Math.max((p.amount / maxPaid) * 100, 2)}%` }}
                        title={`${p.name} paid ${rs(round2(p.amount))}`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              {otherPayers.length > 0 && (
                <p className="text-xs text-muted">
                  {otherPayers.length} more {otherPayers.length === 1 ? "person" : "people"} paid {rs(round2(otherPayers.reduce((s, p) => s + p.amount, 0)))} between them.
                </p>
              )}
            </section>
          )}

          {biggest.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted">Biggest expenses</h2>
              <ul className="card divide-y divide-line py-1">
                {biggest.map((e) => (
                  <li key={e.id}>
                    <Link href={`${base}/expenses/${e.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
                      <CategoryIcon icon={e.icon} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{e.title}</p>
                        <p className="truncate text-xs text-muted">
                          {fmtDay(e.date)} · {e.payer} paid
                        </p>
                      </div>
                      <b className="text-sm tabular-nums">{rs(e.amount)}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-center text-xs text-muted">
            Spending only: payments between people and SMS fees aren&apos;t counted here.
          </p>
        </>
  );
}

function Stat({ label, value, note, children }: { label: string; value: number; note?: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-4 sm:px-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 truncate text-base font-semibold tabular-nums sm:text-lg">{rs(Math.round(value))}</p>
      {note && <p className="mt-0.5 text-[11px] leading-tight text-muted">{note}</p>}
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}
