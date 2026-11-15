import Link from "next/link";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react/ssr";
import { monthName } from "@/lib/insights";
import type { Overview, OverviewPerson } from "@/lib/overview";
import { fmtDay } from "@/lib/time";
import { rs } from "@/lib/types";
import { Avatar, Money } from "@/components/bits";
import { Columns, Delta, TipList } from "@/components/insight-bits";

type Props = {
  o: Overview;
  base: string;
  groupName: string;
  can: { settle: boolean; sms: boolean; books: boolean };
};

const PAIRS_SHOWN = 8;

/** Admin › Overview: where the group's money stands, what needs doing, and how spending is moving. */
export function OverviewView({ o, base, groupName, can }: Props) {
  const owe = o.people.filter((p) => p.net < 0);
  const owed = o.people.filter((p) => p.net > 0).reverse();
  const m = o.members;
  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted">Where {groupName} stands today, and what needs doing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can.settle && (
            <Link href={`${base}/settle`} className="btn-ghost">
              Record a payment
            </Link>
          )}
          {can.sms && owe.length > 0 && (
            <Link href={`${base}/admin/sms`} className="btn-primary">
              Send reminders
            </Link>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Still to settle" value={rs(Math.round(o.unsettled))} note={owe.length ? `${owe.length} ${owe.length === 1 ? "person owes" : "people owe"}` : "Nobody owes anything"} />
        <Tile label={`Spent in ${monthName(o.spend.month)}`} value={rs(Math.round(o.spend.total))}>
          <Delta now={o.spend.total} usual={o.spend.usual} />
        </Tile>
        <Tile
          label="Paid back this month"
          value={rs(Math.round(o.paymentsThisMonth.total))}
          note={`${o.paymentsThisMonth.count} ${o.paymentsThisMonth.count === 1 ? "payment" : "payments"}`}
        />
        <Tile
          label="People"
          value={String(m.active)}
          note={`${m.withApp} with the app${m.guests ? ` · ${m.guests} by SMS only` : ""}${m.pending ? ` · ${m.pending} waiting` : ""}`}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Needs attention</h2>
        {o.tips.length > 0 ? (
          <TipList tips={o.tips} max={6} />
        ) : (
          <p className="card flex items-center gap-3 text-sm">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <CheckCircle size={18} weight="duotone" aria-hidden="true" />
            </span>
            Nothing needs attention right now.
          </p>
        )}
      </section>

      {o.people.length === 0 ? (
        <section className="card">
          <h2 className="font-semibold">Balances</h2>
          <p className="mt-1 text-sm text-muted">Everyone is settled. Nobody owes anything.</p>
        </section>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <People title="Owe money" empty="Nobody owes anything." rows={owe} total={owe.reduce((s, p) => s + p.net, 0)} showPaid />
          <People title="Are owed" empty="Nobody is owed anything." rows={owed} total={owed.reduce((s, p) => s + p.net, 0)} />
        </div>
      )}

      {o.pairs.length > 0 && (
        <section className="card space-y-2">
          <div>
            <h2 className="font-semibold">Who pays whom</h2>
            <p className="text-xs text-muted">The payments that would settle everything today.</p>
          </div>
          <ul className="divide-y divide-line">
            {o.pairs.slice(0, PAIRS_SHOWN).map((p, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  <b className="font-semibold">{p.from}</b>
                  <ArrowRight size={13} className="mx-1.5 inline text-muted" aria-label="pays" />
                  <b className="font-semibold">{p.to}</b>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{rs(p.amount)}</span>
              </li>
            ))}
          </ul>
          {o.pairs.length > PAIRS_SHOWN && (
            <p className="text-xs text-muted">
              And {o.pairs.length - PAIRS_SHOWN} smaller {o.pairs.length - PAIRS_SHOWN === 1 ? "one" : "ones"}:{" "}
              {rs(o.pairs.slice(PAIRS_SHOWN).reduce((s, p) => s + p.amount, 0))} between them.
            </p>
          )}
        </section>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Spending month by month</h2>
            <p className="text-xs text-muted">Expenses and meal orders. Tap a month for the details.</p>
          </div>
          <Link href={`${base}/insights`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
            Open Insights <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <Columns
          label="Group spending month by month"
          items={o.spend.months.map((x) => ({
            key: x.month,
            label: monthName(x.month, "short"),
            value: x.total,
            title: `${monthName(x.month, "long", true)}: ${rs(x.total)}`,
            href: `${base}/insights${x.month === o.spend.month ? "" : `?month=${x.month}`}`,
            selected: x.month === o.spend.month,
          }))}
        />
      </section>

      <section className="card">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Fact label="This week" value={`${o.expensesThisWeek} ${o.expensesThisWeek === 1 ? "expense" : "expenses"} added`} />
          <Fact
            label="SMS this month"
            value={
              o.sms.enabled || o.sms.sentThisMonth
                ? `${o.sms.sentThisMonth} sent${o.sms.cap ? ` of ${o.sms.cap}` : ""}${o.sms.feesThisMonth ? ` · ${rs(o.sms.feesThisMonth)} in fees` : ""}`
                : "Switched off"
            }
          />
          <Fact label="Books" value={o.closedThrough ? `Closed up to ${fmtDay(o.closedThrough)}` : "Never closed"} href={can.books ? `${base}/admin/books` : undefined} />
        </dl>
      </section>
    </div>
  );
}

function Tile({ label, value, note, children }: { label: string; value: string; note?: string; children?: React.ReactNode }) {
  return (
    <div className="card min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

function Fact({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">
        {href ? (
          <Link href={href} className="underline decoration-dotted underline-offset-2">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function People({ title, empty, rows, total, showPaid = false }: { title: string; empty: string; rows: OverviewPerson[]; total: number; showPaid?: boolean }) {
  return (
    <section className="card min-w-0 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          {title} {rows.length > 0 && <span className="font-normal text-muted">({rows.length})</span>}
        </h2>
        {rows.length > 0 && <span className="text-sm font-semibold tabular-nums">{rs(Math.abs(total))}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={p.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="truncate font-medium">{p.name}</span>
                  {p.left && <span className="pill bg-surface-2 text-muted">Left</span>}
                  {!p.registered && !p.left && <span className="pill bg-info-soft text-info-ink">SMS only</span>}
                </p>
                {showPaid && (
                  <p className="text-xs text-muted">
                    {p.lastPaid ? `Last paid ${fmtDay(p.lastPaid)}` : "No payment yet"}
                    {!p.hasPhone && !p.left ? " · no mobile number" : ""}
                  </p>
                )}
              </div>
              <Money value={p.net} signed className="text-sm" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
