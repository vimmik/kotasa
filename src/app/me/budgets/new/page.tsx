import type { Metadata } from "next";
import { getBudgets, getMe, suggestionsFor } from "@/lib/personal";
import { todayColombo } from "@/lib/time";
import { PageHeader } from "@/components/bits";
import { PersonalBudgetForm } from "@/components/personal-budget-form";

export const metadata: Metadata = { title: "New budget" };

export default async function NewBudget(props: PageProps<"/me/budgets/new">) {
  const sp = await props.searchParams;
  const { profile, currency, categories } = await getMe();
  const budgets = await getBudgets(profile.id);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="New budget"
        sub={profile.monthly_income ? undefined : "Tip: add your take-home pay in settings and Kotasa suggests an amount."}
      />
      <PersonalBudgetForm
        categories={categories}
        currency={currency}
        today={todayColombo()}
        payday={profile.payday}
        suggestions={suggestionsFor(profile.monthly_income)}
        mainDefault={sp.main === "1" || !budgets.some((b) => b.is_main)}
      />
    </div>
  );
}
