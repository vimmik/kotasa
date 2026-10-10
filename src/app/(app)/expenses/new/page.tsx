import { requireMember } from "@/lib/auth";
import { listPeople } from "@/lib/ledger";
import { createAdminClient } from "@/lib/supabase/server";
import { todayColombo } from "@/lib/time";
import { PageHeader } from "@/components/bits";
import { ExpenseForm } from "@/components/expense-form";

export default async function NewExpensePage(props: PageProps<"/expenses/new">) {
  const me = await requireMember();
  const sp = await props.searchParams;
  const [people, { data: budgets }] = await Promise.all([
    listPeople(),
    createAdminClient().from("budgets").select("id, name").eq("closed", false).order("name"),
  ]);
  // Put "you" first
  people.sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Add expense" sub="Anyone can pay; everyone sees what they owe." />
      <ExpenseForm
        me={me.id}
        people={people}
        budgets={budgets ?? []}
        today={todayColombo()}
        defaultBudget={typeof sp.budget === "string" ? sp.budget : undefined}
      />
    </div>
  );
}
