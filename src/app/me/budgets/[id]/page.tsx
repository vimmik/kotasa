import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Archive } from "@phosphor-icons/react/ssr";
import { archivePersonalBudget } from "@/app/actions/personal";
import { money } from "@/lib/currency";
import { rangeLabel } from "@/lib/periods";
import { budgetStatus, getBudgets, getMe, getSpend, spendWindow, suggestionsFor } from "@/lib/personal";
import { todayColombo } from "@/lib/time";
import { PageHeader } from "@/components/bits";
import { MeBar, SpendList } from "@/components/me-bits";
import { PersonalBudgetForm } from "@/components/personal-budget-form";
import { ConfirmButton } from "@/components/ui";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetPage(props: PageProps<"/me/budgets/[id]">) {
  const { id } = await props.params;
  const { profile, currency, categories } = await getMe();
  const budget = (await getBudgets(profile.id)).find((b) => b.id === id);
  if (!budget) notFound();
  const today = todayColombo();
  const win = spendWindow([budget], today, profile.payday);
  const rows = await getSpend(profile.id, win.start, win.end);
  const s = budgetStatus(budget, rows, today, profile.payday);
  const inThis = rows.filter(
    (r) =>
      r.counted &&
      r.spent_on >= s.range.start &&
      r.spent_on <= s.range.end &&
      (!budget.categories || budget.categories.includes(r.category)),
  );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title={budget.name} sub={rangeLabel(budget.period, s.range)} />
      <section className="card space-y-3">
        <MeBar spent={s.spent} limit={s.limit} currency={currency} label={`${budget.name} used`} />
        {s.state === "active" && s.left > 0 && s.daysLeft > 1 && (
          <p className="text-sm text-muted">
            {money(s.perDay, currency)} a day for the next {s.daysLeft} days.
          </p>
        )}
      </section>
      {inThis.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">In this budget</h2>
          <div className="card py-1">
            <SpendList rows={inThis.slice(0, 20)} categories={categories} currency={currency} />
          </div>
        </section>
      )}
      <h2 className="pt-2 text-lg font-semibold">Edit</h2>
      <PersonalBudgetForm
        categories={categories}
        currency={currency}
        today={today}
        payday={profile.payday}
        suggestions={suggestionsFor(profile.monthly_income)}
        budget={budget}
      />
      <form action={archivePersonalBudget}>
        <input type="hidden" name="id" value={budget.id} />
        <ConfirmButton
          className="btn-ghost w-full text-danger"
          pendingText="Removing…"
          title="Remove this budget?"
          message="Your spending stays. Only this budget goes away."
          confirmText="Remove"
          danger
        >
          <Archive size={16} aria-hidden="true" /> Remove budget
        </ConfirmButton>
      </form>
    </div>
  );
}
