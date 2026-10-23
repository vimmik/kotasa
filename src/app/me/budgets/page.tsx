import Link from "next/link";
import type { Metadata } from "next";
import { ArrowsClockwise, ChartPieSlice, Plus, Star } from "@phosphor-icons/react/ssr";
import { money } from "@/lib/currency";
import { PERIODS, rangeLabel } from "@/lib/periods";
import { budgetStatus, getBudgets, getMe, getSpend, spendWindow } from "@/lib/personal";
import { fmtDay, todayColombo } from "@/lib/time";
import { EmptyState, PageHeader } from "@/components/bits";
import { MeBar } from "@/components/me-bits";

export const metadata: Metadata = { title: "Budgets" };

export default async function Budgets() {
  const { profile, currency, categories } = await getMe();
  const today = todayColombo();
  const budgets = await getBudgets(profile.id);
  const win = spendWindow(budgets, today, profile.payday);
  const rows = budgets.length ? await getSpend(profile.id, win.start, win.end) : [];
  const label = new Map(categories.map((c) => [c.key, c.label]));

  return (
    <div className="stagger space-y-6">
      <PageHeader
        title="Budgets"
        sub="Daily, weekly, monthly, payday to payday, yearly, or for a trip"
        action={
          // With none yet, the empty state below has the one button to start.
          budgets.length > 0 && (
            <Link href="/me/budgets/new" className="btn-primary">
              <Plus size={16} aria-hidden="true" /> New budget
            </Link>
          )
        }
      />
      {budgets.length === 0 ? (
        <EmptyState
          icon={ChartPieSlice}
          title="No budgets yet"
          body="Pick how much you want to spend a day, a week, a month or per pay cycle. Kotasa keeps score as you go, group spending included."
          action={
            <Link href="/me/budgets/new?main=1" className="btn-primary">
              Set my budget
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {budgets.map((b) => {
            const s = budgetStatus(b, rows, today, profile.payday);
            return (
              <li key={b.id}>
                <Link href={`/me/budgets/${b.id}`} className="card-link block space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <span className="truncate">{b.name}</span>
                        {b.is_main && <Star size={14} weight="fill" className="shrink-0 text-amber" aria-label="Main budget" />}
                      </p>
                      <p className="text-xs text-muted">
                        {PERIODS.find((p) => p.id === b.period)?.label} · {rangeLabel(b.period, s.range)}
                        {b.categories ? ` · ${b.categories.map((k) => label.get(k) ?? k).join(", ")}` : ""}
                      </p>
                    </div>
                    {s.state === "active" && s.daysLeft > 1 && s.left > 0 && (
                      <span className="pill shrink-0 bg-surface-2 text-muted">{money(s.perDay, currency)}/day</span>
                    )}
                  </div>
                  {s.state === "upcoming" ? (
                    <p className="text-sm text-muted">Starts {fmtDay(s.range.start)}</p>
                  ) : (
                    <MeBar spent={s.spent} limit={s.limit} currency={currency} label={`${b.name} used`} />
                  )}
                  {b.rollover === "carry" && Math.abs(s.carry) >= 0.01 && (
                    <p className={`flex items-center gap-1 text-xs ${s.carry > 0 ? "text-brand-strong" : "text-danger"}`}>
                      <ArrowsClockwise size={12} aria-hidden="true" />
                      {s.carry > 0 ? `${money(s.carry, currency)} carried in` : `${money(-s.carry, currency)} overspent earlier, taken off`}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
