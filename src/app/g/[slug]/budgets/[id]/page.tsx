import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "@phosphor-icons/react/ssr";
import { can, requireMember, requireModule } from "@/lib/auth";
import { listMembers } from "@/lib/ledger";
import { getCategories } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { fmtDay } from "@/lib/time";
import { rs, type Budget, type Expense } from "@/lib/types";
import { CategoryIcon, EmptyState, PageHeader } from "@/components/bits";
import { BudgetBar } from "@/components/budget-bar";
import { BudgetForm } from "@/components/budget-form";

export default async function BudgetPage(props: PageProps<"/g/[slug]/budgets/[id]">) {
  const { slug, id } = await props.params;
  const ctx = await requireMember(slug);
  requireModule(ctx, "budgets");
  const { org, member: me, base } = ctx;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = orgDb(org.id);
  const [{ data: b }, { data: ex }, people, cats] = await Promise.all([
    db.select("budgets").eq("id", id).maybeSingle(),
    db.select("expenses").eq("budget_id", id).order("expense_date", { ascending: false }),
    listMembers(org.id, { includeInactive: true }),
    getCategories(org.id, { includeArchived: true }),
  ]);
  const iconOf = new Map(cats.map((c) => [c.key, c.icon]));
  if (!b) notFound();
  const budget = b as Budget;
  const expenses = (ex ?? []) as Expense[];
  const names = new Map(people.map((p) => [p.id, p.full_name.split(" ")[0]]));
  const spent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const canEdit = can(ctx, "budgets.manage") || budget.created_by === me.id;

  // Who paid how much into this budget
  const byPayer = new Map<string, number>();
  expenses.forEach((e) => byPayer.set(e.paid_by, (byPayer.get(e.paid_by) ?? 0) + Number(e.amount)));

  return (
    <div className="stagger space-y-5">
      <PageHeader
        title={budget.name}
        sub={budget.description ?? undefined}
        action={
          !budget.closed && (
            <Link href={`${base}/expenses/new?budget=${budget.id}`} className="btn-primary">
              <Plus size={16} aria-hidden="true" /> Add expense
            </Link>
          )
        }
      />
      <section className="card space-y-4">
        <BudgetBar spent={spent} limit={budget.limit_amount ? Number(budget.limit_amount) : null} />
        {byPayer.size > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {[...byPayer.entries()].map(([pid, amt]) => (
              <span key={pid} className="pill bg-surface-2 text-ink">
                {names.get(pid)} paid {rs(amt)}
              </span>
            ))}
          </div>
        )}
      </section>

      {expenses.length === 0 ? (
        <EmptyState title="Nothing spent yet" body="Expenses you add to this budget show up here." />
      ) : (
        <ul className="card divide-y divide-line py-1">
          {expenses.map((e) => (
            <li key={e.id}>
              <Link href={`${base}/expenses/${e.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-surface-2">
                <CategoryIcon icon={iconOf.get(e.category)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.title}</p>
                  <p className="text-xs text-muted">
                    {fmtDay(e.expense_date)} · {names.get(e.paid_by)} paid
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{rs(e.amount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canEdit && <BudgetForm budget={budget} />}
    </div>
  );
}
