import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Trash } from "@phosphor-icons/react/ssr";
import { deletePersonalExpense } from "@/app/actions/personal";
import { meDb } from "@/lib/me-db";
import { getMe } from "@/lib/personal";
import { todayColombo } from "@/lib/time";
import { PageHeader } from "@/components/bits";
import { PersonalExpenseForm } from "@/components/personal-expense-form";
import { ConfirmButton } from "@/components/ui";

export const metadata: Metadata = { title: "Edit spending" };

export default async function EditSpending(props: PageProps<"/me/spending/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile, currency, categories } = await getMe();
  const { data } = await meDb(profile.id)
    .select("personal_expenses", "id, amount, title, category, spent_on, note")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const entry = data as { id: string; amount: number; title: string; category: string; spent_on: string; note: string | null };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Edit spending" />
      <PersonalExpenseForm categories={categories} currency={currency} today={todayColombo()} entry={{ ...entry, amount: Number(entry.amount) }} />
      <form action={deletePersonalExpense}>
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="back" value="1" />
        <ConfirmButton
          className="btn-ghost w-full text-danger"
          pendingText="Deleting…"
          title="Delete this entry?"
          message={`“${entry.title}” goes from your spending. This can't be undone.`}
          confirmText="Delete"
          danger
        >
          <Trash size={16} aria-hidden="true" /> Delete
        </ConfirmButton>
      </form>
    </div>
  );
}
