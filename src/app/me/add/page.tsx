import type { Metadata } from "next";
import { getHabits, getMe, starterChips } from "@/lib/personal";
import { todayColombo } from "@/lib/time";
import { PageHeader } from "@/components/bits";
import { PersonalExpenseForm } from "@/components/personal-expense-form";
import { QuickAdd } from "@/components/quick-add";

export const metadata: Metadata = { title: "Add spending" };

export default async function AddSpending() {
  const { profile, currency, categories } = await getMe();
  const habits = await getHabits(profile.id);
  const today = todayColombo();
  return (
    <div className="stagger mx-auto max-w-xl space-y-6">
      <PageHeader title="Add spending" sub="Type it in one line, or fill in the details below." />
      <QuickAdd
        categories={categories}
        history={habits.history}
        chips={habits.chips}
        starters={starterChips()}
        today={today}
        currency={currency}
        autoFocus
      />
      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-semibold text-brand">
          <span className="group-open:hidden">Add with a note or an older date</span>
          <span className="hidden group-open:inline">Hide the details form</span>
        </summary>
        <div className="mt-3">
          <PersonalExpenseForm categories={categories} currency={currency} today={today} />
        </div>
      </details>
    </div>
  );
}
