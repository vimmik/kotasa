import Link from "next/link";
import { ChartPieSlice } from "@phosphor-icons/react/ssr";
import { can, requireMember, requireModule } from "@/lib/auth";
import { orgDb } from "@/lib/org-db";
import { fmtDay } from "@/lib/time";
import type { Budget } from "@/lib/types";
import { EmptyState, PageHeader } from "@/components/bits";
import { BudgetBar } from "@/components/budget-bar";
import { BudgetForm } from "@/components/budget-form";

export default async function BudgetsPage(props: PageProps<"/g/[slug]/budgets">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  requireModule(ctx, "budgets");
  const db = orgDb(ctx.org.id);
  const [{ data: budgets }, { data: spend }] = await Promise.all([
    db.select("budgets").order("closed").order("created_at", { ascending: false }),
    db.select("expenses", "budget_id, amount").not("budget_id", "is", null),
  ]);
  const spent = new Map<string, number>();
  ((spend ?? []) as { budget_id: string; amount: number }[]).forEach((e) =>
    spent.set(e.budget_id, (spent.get(e.budget_id) ?? 0) + Number(e.amount)),
  );
  const list = (budgets ?? []) as Budget[];

  return (
    <div className="stagger space-y-5">
      <PageHeader title="Budgets" sub="Keep a trip, an event or a monthly fund under its limit." />
      {list.length === 0 ? (
        <EmptyState icon={ChartPieSlice} title="No budgets yet" body="Create one for a team outing or the monthly tea fund, then add expenses to it." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((b) => (
            <Link key={b.id} href={`${ctx.base}/budgets/${b.id}`} className={`card-link space-y-3 ${b.closed ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{b.name}</p>
                  <p className="truncate text-xs text-muted">
                    {b.starts_on || b.ends_on
                      ? `${b.starts_on ? fmtDay(b.starts_on) : "…"} – ${b.ends_on ? fmtDay(b.ends_on) : "…"}`
                      : (b.description ?? "Ongoing")}
                  </p>
                </div>
                {b.closed && <span className="pill bg-surface-2 text-muted">Closed</span>}
              </div>
              <BudgetBar spent={spent.get(b.id) ?? 0} limit={b.limit_amount ? Number(b.limit_amount) : null} />
            </Link>
          ))}
        </div>
      )}
      {can(ctx, "expense.add") && <BudgetForm />}
    </div>
  );
}
