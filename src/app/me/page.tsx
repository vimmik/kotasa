import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ChartPieSlice, Info, Sparkle } from "@phosphor-icons/react/ssr";
import { money } from "@/lib/currency";
import { rangeLabel, startOfMonth } from "@/lib/periods";
import { budgetStatus, getBudgets, getHabits, getMe, getSpend, spendWindow, starterChips, suggestBudget } from "@/lib/personal";
import { addDays, todayColombo } from "@/lib/time";
import { EmptyState } from "@/components/bits";
import { MeBar, SpendList } from "@/components/me-bits";
import { QuickAdd } from "@/components/quick-add";

export const metadata: Metadata = { title: "Today" };

export default async function MeToday() {
  const { profile, currency, categories } = await getMe();
  const today = todayColombo();
  const [budgets, habits] = await Promise.all([getBudgets(profile.id), getHabits(profile.id)]);
  const win = spendWindow(budgets, today, profile.payday);
  const from = [win.start, startOfMonth(today), addDays(today, -30)].sort()[0];
  const rows = await getSpend(profile.id, from, win.end);

  const main = budgets.find((b) => b.is_main);
  const others = budgets.filter((b) => !b.is_main);
  const status = main ? budgetStatus(main, rows, today, profile.payday) : null;
  const monthSpent = rows.reduce((s, r) => (r.counted && r.spent_on >= startOfMonth(today) && r.spent_on <= today ? s + r.amount : s), 0);
  const recent = rows.filter((r) => r.spent_on <= today).slice(0, 8);
  const foreign = rows.filter((r) => !r.counted && r.spent_on >= startOfMonth(today));
  const suggestion = suggestBudget(profile.monthly_income, "month");
  const first = profile.full_name.split(" ")[0];

  return (
    <div className="stagger space-y-6">
      <section className="card relative overflow-hidden p-0">
        <div
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-brand-soft opacity-70 blur-3xl"
          aria-hidden="true"
        />
        {status && main && status.state === "active" ? (
          <div className="relative space-y-4 px-5 pt-5 pb-5">
            <div>
              <p className="text-sm text-muted">Hi {first}</p>
              {status.safeToday >= 0.005 ? (
                <>
                  <p className="mt-3 text-sm font-medium">Safe to spend today</p>
                  <p className="text-4xl font-semibold tracking-[-0.03em] text-brand tabular-nums sm:text-5xl">
                    {money(status.safeToday, currency)}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-sm font-medium">{status.left < 0 ? "Over budget" : "Today's share is used up"}</p>
                  <p className="text-4xl font-semibold tracking-[-0.03em] text-danger tabular-nums sm:text-5xl">
                    {status.left < 0 ? money(-status.left, currency) : money(0, currency)}
                  </p>
                </>
              )}
              <p className="mt-1 text-xs text-muted">
                {status.left > 0
                  ? `${money(status.left, currency)} left for ${status.daysLeft === 1 ? "today" : `${status.daysLeft} days`} · ${main.name}, ${rangeLabel(main.period, status.range)}`
                  : `${main.name}, ${rangeLabel(main.period, status.range)}`}
              </p>
            </div>
            <MeBar spent={status.spent} limit={status.limit} currency={currency} label={`${main.name} used`} />
            <Pace spent={status.spent} projected={status.projected} limit={status.limit} currency={currency} daysLeft={status.daysLeft} />
          </div>
        ) : (
          <div className="relative px-5 pt-5 pb-6">
            <p className="text-sm text-muted">Hi {first}</p>
            <p className="mt-3 text-sm font-medium">Spent this month</p>
            <p className="text-4xl font-semibold tracking-[-0.03em] tabular-nums sm:text-5xl">{money(monthSpent, currency)}</p>
            <p className="mt-2 max-w-md text-sm text-muted">
              Set a budget and Kotasa tells you each morning how much you can safely spend that day.
            </p>
            <Link href="/me/budgets/new?main=1" className="btn-primary mt-4">
              <Sparkle size={16} aria-hidden="true" />
              {suggestion ? `Set a budget (suggested ${money(suggestion, currency)} a month)` : "Set my budget"}
            </Link>
          </div>
        )}
      </section>

      <QuickAdd
        categories={categories}
        history={habits.history}
        chips={habits.chips}
        starters={starterChips()}
        today={today}
        currency={currency}
      />

      {others.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted">Budgets</h2>
            <Link href="/me/budgets" className="text-sm font-semibold text-brand">All budgets</Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {others.map((b) => {
              const s = budgetStatus(b, rows, today, profile.payday);
              return (
                <li key={b.id}>
                  <Link href={`/me/budgets/${b.id}`} className="card-link block space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{b.name}</span>
                      <span className="shrink-0 text-xs text-muted">{rangeLabel(b.period, s.range)}</span>
                    </div>
                    <MeBar spent={s.spent} limit={s.limit} currency={currency} label={`${b.name} used`} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">Recent</h2>
          <Link href="/me/spending" className="text-sm font-semibold text-brand">See all</Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={ChartPieSlice}
            title="Nothing spent yet"
            body="Type what you spent above, like “lunch 450”. Your share of anything in your groups shows up here by itself."
          />
        ) : (
          <div className="card py-1">
            <SpendList rows={recent} categories={categories} currency={currency} />
          </div>
        )}
      </section>

      {foreign.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info-ink">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {foreign.length} group {foreign.length === 1 ? "entry is" : "entries are"} in another currency this month, so
          they aren&apos;t in your totals. They&apos;re listed under Spending.
        </p>
      )}

      <Link href="/me/settings" className="card-link flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
          <Sparkle size={18} weight="duotone" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Only you can see this</p>
          <p className="truncate text-sm text-muted">Currency, payday, categories and which groups feed in</p>
        </div>
        <ArrowRight size={18} className="text-muted" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** One plain sentence about where the period is heading. */
function Pace({ spent, projected, limit, currency, daysLeft }: { spent: number; projected: number; limit: number; currency: string; daysLeft: number }) {
  if (daysLeft <= 1 || spent <= 0) return null;
  const diff = projected - limit;
  if (Math.abs(diff) < limit * 0.03) return <p className="text-sm text-muted">Right on pace to land on budget.</p>;
  return diff > 0 ? (
    <p className="text-sm text-amber-ink">At this pace you&apos;ll go {money(diff, currency)} over. Spend a little less each day to land on budget.</p>
  ) : (
    <p className="text-sm text-brand-strong">At this pace you&apos;ll have {money(-diff, currency)} left over.</p>
  );
}
