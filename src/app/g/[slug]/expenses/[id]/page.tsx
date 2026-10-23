import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilSimple, Trash } from "@phosphor-icons/react/ssr";
import { can, requireMember } from "@/lib/auth";
import { closedThrough } from "@/lib/closing";
import { listMembers } from "@/lib/ledger";
import { getCategories } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { getExpenseCopayers, paidByEach } from "@/lib/payers";
import { fmtDay, todayColombo } from "@/lib/time";
import { rs, type Expense, type ExpenseShare } from "@/lib/types";
import { deleteExpense } from "@/app/actions/expenses";
import { Avatar, CategoryIcon, PageHeader } from "@/components/bits";
import { ConfirmButton } from "@/components/ui";
import { ExpenseForm } from "@/components/expense-form";

export default async function ExpensePage(props: PageProps<"/g/[slug]/expenses/[id]">) {
  const { slug, id } = await props.params;
  const ctx = await requireMember(slug);
  const { org, member: me, base } = ctx;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const db = orgDb(org.id);
  const [{ data: e }, { data: shareRows }, people, categories, copayerMap, through] = await Promise.all([
    db.select("expenses").eq("id", id).maybeSingle(),
    db.select("expense_shares").eq("expense_id", id),
    listMembers(org.id, { includeInactive: true }),
    getCategories(org.id, { includeArchived: true }),
    getExpenseCopayers(org.id, [id]),
    closedThrough(org.id),
  ]);
  if (!e) notFound();
  const expense = e as Expense;
  const shares = (shareRows ?? []) as ExpenseShare[];
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const cat = categories.find((c) => c.key === expense.category);
  const copayers = copayerMap.get(id) ?? [];
  const paid = paidByEach(Number(expense.amount), expense.paid_by, copayers);
  const locked = !!through && expense.expense_date <= through;
  const canEdit = !locked && (can(ctx, "expense.edit_any") || expense.created_by === me.id || paid.has(me.id));
  const myShare = Number(shares.find((s) => s.person_id === me.id)?.amount ?? 0);
  const myNet = (paid.get(me.id) ?? 0) - myShare;
  const who = (pid: string) => (pid === me.id ? "You" : names.get(pid));

  let budgetName: string | null = null;
  if (expense.budget_id) {
    const { data: b } = await db.select("budgets", "name").eq("id", expense.budget_id).maybeSingle();
    budgetName = (b as { name: string } | null)?.name ?? null;
  }

  if (sp.edit === "1" && canEdit) {
    const { data: budgets } = await db.select("budgets", "id, name").eq("closed", false).order("name");
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Edit expense" />
        <ExpenseForm
          me={me.id}
          people={people.filter((p) => p.status === "active")}
          budgets={(budgets ?? []) as { id: string; name: string }[]}
          categories={categories.filter((c) => !c.archived || c.key === expense.category)}
          today={todayColombo()}
          canAddGuests={can(ctx, "members.invite")}
          expense={expense}
          shares={Object.fromEntries(shares.map((s) => [s.person_id, Number(s.amount)]))}
          copayers={copayers}
          closedThrough={through}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card space-y-4 p-5">
        <div className="flex items-start gap-3">
          <CategoryIcon icon={cat?.icon} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{expense.title}</h1>
            <p className="text-sm text-muted">
              {fmtDay(expense.expense_date)} · {cat?.label ?? "Other"}
              {budgetName && (
                <>
                  {" · "}
                  <Link href={`${base}/budgets/${expense.budget_id}`} className="font-semibold text-brand">
                    {budgetName}
                  </Link>
                </>
              )}
            </p>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{rs(expense.amount)}</p>
        </div>
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
          {copayers.length ? (
            [...paid].map(([pid, amt], i) => (
              <span key={pid}>
                {i > 0 && ", "}
                <b>{who(pid)}</b> paid {rs(amt)}
              </span>
            ))
          ) : (
            <>
              <b>{who(expense.paid_by)}</b> paid
            </>
          )}{" "}
          · {expense.split_type === "equal" ? "split equally" : "custom split"}
          {myNet < -0.004 && (
            <>
              {" · "}you owe <b className="text-danger">{rs(-myNet)}</b>
            </>
          )}
          {myNet > 0.004 && (
            <>
              {" · "}you get back <b className="text-brand">{rs(myNet)}</b>
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
                {paid.has(s.person_id) ? (
                  <span className="text-muted">{rs(s.amount)} · paid {rs(paid.get(s.person_id)!)}</span>
                ) : (
                  <b>{rs(s.amount)}</b>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/expenses`} className="btn-ghost">
          Back
        </Link>
        {canEdit && (
          <>
            <Link href={`${base}/expenses/${id}?edit=1`} className="btn-ghost">
              <PencilSimple size={15} aria-hidden="true" /> Edit
            </Link>
            <form action={deleteExpense}>
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="id" value={id} />
              <ConfirmButton
                className="btn-danger"
                pendingText="Deleting…"
                title="Delete this expense?"
                message="This removes it for everyone and updates balances. It can't be undone."
                confirmText="Delete expense"
                danger
              >
                <Trash size={15} aria-hidden="true" /> Delete
              </ConfirmButton>
            </form>
          </>
        )}
      </div>
      <p className="text-xs text-muted">
        Added by {names.get(expense.created_by ?? "") ?? "someone"}.
        {locked && ` The books are closed up to ${fmtDay(through!)}, so it can't be changed.`}
      </p>
    </div>
  );
}
