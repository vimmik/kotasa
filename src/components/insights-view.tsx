import Link from "next/link";
import { fmtDay } from "@/lib/time";
import { round2, rs } from "@/lib/types";
import { Avatar, CategoryIcon } from "@/components/bits";

type Props = {
  base: string;
  total: number;
  mine: number;
  iPaid: number;
  totalNote?: string;
  mineNote?: string;
  /** biggest first */
  categories: { key: string; label: string; icon?: string | null; total: number; mine: number }[];
  /** biggest first; name is "You" for the viewer */
  payers: { id: string; name: string; amount: number }[];
  biggest: { id: string; title: string; date: string; icon?: string | null; payer: string; amount: number }[];
};

/** One month of a group's spending: headline numbers, by category, who paid, biggest expenses. */
export function InsightsView({ base, total, mine, iPaid, totalNote, mineNote, categories, payers, biggest }: Props) {
  const maxCat = Math.max(...categories.map((c) => c.total), 1);
  const shownPayers = payers.slice(0, 6);
  const otherPayers = payers.slice(6);
  const maxPaid = Math.max(...payers.map((p) => p.amount), 1);
  return (
        <>
          <section className="card grid grid-cols-3 divide-x divide-line p-0 text-sm">
            <Stat label="Group spent" value={total} note={totalNote} />
            <Stat label="Your share" value={mine} note={mineNote} />
            <Stat label="You paid" value={iPaid} note={iPaid > mine ? `${rs(round2(iPaid - mine))} for others` : undefined} />
          </section>

          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">By category</h2>
              <p className="flex items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px] bg-brand" aria-hidden="true" /> Your share
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px] bg-muted/40" aria-hidden="true" /> Everyone else
                </span>
              </p>
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

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="min-w-0 px-3 py-4 sm:px-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 truncate text-base font-semibold tabular-nums sm:text-lg">{rs(Math.round(value))}</p>
      {note && <p className="mt-0.5 text-[11px] leading-tight text-muted">{note}</p>}
    </div>
  );
}
