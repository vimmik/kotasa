import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilSimple, Trash } from "@phosphor-icons/react/ssr";
import { requireMember } from "@/lib/auth";
import { listPeople } from "@/lib/ledger";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDay, todayColombo } from "@/lib/time";
import { CATEGORIES, rs, type Expense, type ExpenseShare } from "@/lib/types";
import { deleteExpense } from "@/app/actions/expenses";
import { Avatar, CategoryIcon, PageHeader } from "@/components/bits";
import { ExpenseForm } from "@/components/expense-form";

export default async function ExpensePage(props: PageProps<"/expenses/[id]">) {
  const me = await requireMember();
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const admin = createAdminClient();
  const [{ data: e }, { data: shareRows }, people] = await Promise.all([
    admin.from("expenses").select("*").eq("id", id).maybeSingle(),
    admin.from("expense_shares").select("*").eq("expense_id", id),
    listPeople({ includeInactive: true }),
  ]);
  if (!e) notFound();
  const expense = e as Expense;
  const shares = (shareRows ?? []) as ExpenseShare[];
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const canEdit = me.is_admin || expense.created_by === me.id || expense.paid_by === me.id;
  const myShare = shares.find((s) => s.person_id === me.id)?.amount ?? 0;

  let budgetName: string | null = null;
  if (expense.budget_id) {
    const { data: b } = await admin.from("budgets").select("name").eq("id", expense.budget_id).maybeSingle();
    budgetName = b?.name ?? null;
  }

  if (sp.edit === "1" && canEdit) {
    const { data: budgets } = await admin.from("budgets").select("id, name").eq("closed", false).order("name");
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Edit expense" />
        <ExpenseForm
          me={me.id}
          people={people.filter((p) => p.status === "active")}
          budgets={budgets ?? []}
          today={todayColombo()}
          expense={expense}
          shares={Object.fromEntries(shares.map((s) => [s.person_id, Number(s.amount)]))}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card space-y-4 p-5">
        <div className="flex items-start gap-3">
          <CategoryIcon category={expense.category} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{expense.title}</h1>
            <p className="text-sm text-muted">
              {fmtDay(expense.expense_date)} · {CATEGORIES.find((c) => c.id === expense.category)?.label ?? "Other"}
              {budgetName && (
                <>
                  {" · "}
                  <Link href={`/budgets/${expense.budget_id}`} className="font-semibold text-brand">{budgetName}</Link>
                </>
              )}
            </p>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{rs(expense.amount)}</p>
        </div>
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <b>{expense.paid_by === me.id ? "You" : names.get(expense.paid_by)}</b> paid ·{" "}
          {expense.split_type === "equal" ? "split equally" : "custom split"}
          {myShare > 0 && expense.paid_by !== me.id && (
            <>
              {" · "}your share <b className="text-danger">{rs(myShare)}</b>
            </>
          )}
        </p>
        {expense.note && <p className="text-sm text-muted">{expense.note}</p>}
      </div>

      <section className="card">
        <h2 className="mb-1 font-semibold">Who owes what</h2>
        <ul className="divide-y divide-line">
          {shares.map((s) => (
            <li key={s.person_id} className="flex items-center gap-3 py-2.5">
              <Avatar name={names.get(s.person_id) ?? "?"} size={32} />
              <span className="flex-1 font-medium">{s.person_id === me.id ? "You" : names.get(s.person_id)}</span>
              <span className="text-sm tabular-nums">
                {s.person_id === expense.paid_by ? (
                  <span className="text-muted">{rs(s.amount)} · paid</span>
                ) : (
                  <b>{rs(s.amount)}</b>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/expenses" className="btn-ghost">Back</Link>
        {canEdit && (
          <>
            <Link href={`/expenses/${id}?edit=1`} className="btn-ghost">
              <PencilSimple size={15} aria-hidden="true" /> Edit
            </Link>
            <form action={deleteExpense}>
              <input type="hidden" name="id" value={id} />
              <button className="btn-danger">
                <Trash size={15} aria-hidden="true" /> Delete
              </button>
            </form>
          </>
        )}
      </div>
      <p className="text-xs text-muted">Added by {names.get(expense.created_by ?? "") ?? "someone"}.</p>
    </div>
  );
}
