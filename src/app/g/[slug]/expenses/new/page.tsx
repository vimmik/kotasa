import { requirePermission } from "@/lib/auth";
import { listMembers } from "@/lib/ledger";
import { getCategories } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { todayColombo } from "@/lib/time";
import { PageHeader } from "@/components/bits";
import { ExpenseForm } from "@/components/expense-form";

export default async function NewExpensePage(props: PageProps<"/g/[slug]/expenses/new">) {
  const { slug } = await props.params;
  const ctx = await requirePermission(slug, "expense.add");
  const { org, member: me } = ctx;
  const sp = await props.searchParams;
  const [people, { data: budgets }, categories] = await Promise.all([
    listMembers(org.id),
    ctx.settings.budgets_enabled
      ? orgDb(org.id).select("budgets", "id, name").eq("closed", false).order("name")
      : Promise.resolve({ data: [] }),
    getCategories(org.id),
  ]);
  // Put "you" first
  people.sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Add expense" sub="Anyone can pay; everyone sees what they owe." />
      <ExpenseForm
        me={me.id}
        people={people}
        budgets={(budgets ?? []) as { id: string; name: string }[]}
        categories={categories}
        today={todayColombo()}
        canAddGuests={ctx.perms.has("members.invite")}
        defaultBudget={typeof sp.budget === "string" ? sp.budget : undefined}
      />
    </div>
  );
}
