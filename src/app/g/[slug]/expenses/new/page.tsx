import { requirePermission } from "@/lib/auth";
import { closedThrough } from "@/lib/closing";
import { listMembers } from "@/lib/ledger";
import { getCategories } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { todayColombo } from "@/lib/time";
import { receiptScanEnabled } from "@/lib/receipt";
import { getExpenseCopayers } from "@/lib/payers";
import type { Copayer, Expense } from "@/lib/types";
import { PageHeader } from "@/components/bits";
import { ExpenseForm } from "@/components/expense-form";

export default async function NewExpensePage(props: PageProps<"/g/[slug]/expenses/new">) {
  const { slug } = await props.params;
  const ctx = await requirePermission(slug, "expense.add");
  const { org, member: me } = ctx;
  const sp = await props.searchParams;
  const [people, { data: budgets }, categories, through, { data: recent }] = await Promise.all([
    listMembers(org.id),
    ctx.settings.budgets_enabled
      ? orgDb(org.id).select("budgets", "id, name").eq("closed", false).order("name")
      : Promise.resolve({ data: [] }),
    getCategories(org.id),
    closedThrough(org.id),
    orgDb(org.id)
      .select("expenses", "id, expense_shares(person_id)")
      .or(`created_by.eq.${me.id},paid_by.eq.${me.id}`)
      .is("meal", null)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  // Put "you" first
  people.sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0));
  const active = new Set(people.map((p) => p.id));

  // "Add again": start from an earlier expense (same title, amount, people and split), dated today.
  const today = todayColombo();
  let template: { expense: Expense; shares: Record<string, number>; copayers: Copayer[] } | null = null;
  if (typeof sp.from === "string" && /^[0-9a-f-]{36}$/.test(sp.from)) {
    const [{ data: src }, { data: srcShares }, srcCopayers] = await Promise.all([
      orgDb(org.id).select("expenses").eq("id", sp.from).is("meal", null).maybeSingle(),
      orgDb(org.id).select("expense_shares", "person_id, amount").eq("expense_id", sp.from),
      getExpenseCopayers(org.id, [sp.from]),
    ]);
    if (src) {
      const e = src as Expense;
      const keep = (ids: string[]) => ids.filter((id) => active.has(id));
      template = {
        expense: {
          ...e,
          expense_date: today,
          paid_by: active.has(e.paid_by) ? e.paid_by : me.id,
          budget_id: (budgets ?? []).some((b) => (b as { id: string }).id === e.budget_id) ? e.budget_id : null,
          category: categories.some((c) => c.key === e.category) ? e.category : (categories[0]?.key ?? "other"),
          // People who have left since are dropped; the form shows what no longer adds up.
          bill: e.bill ? { ...e.bill, items: e.bill.items.map((i) => ({ ...i, people: keep(i.people) })) } : null,
        },
        shares: Object.fromEntries(
          ((srcShares ?? []) as { person_id: string; amount: number }[]).filter((s) => active.has(s.person_id)).map((s) => [s.person_id, Number(s.amount)]),
        ),
        copayers: (srcCopayers.get(sp.from) ?? []).filter((c) => active.has(c.member_id)),
      };
    }
  }

  // The groups of people I split with lately, so the same lunch crowd is one tap. Not "everyone"
  // (there's a button for that) and not just me.
  const recentSets: string[][] = [];
  for (const r of (recent ?? []) as { expense_shares: { person_id: string }[] }[]) {
    const set = r.expense_shares.map((s) => s.person_id).sort();
    if (set.length < 2 || set.length >= people.length || !set.every((id) => active.has(id))) continue;
    if (recentSets.some((x) => x.join() === set.join())) continue;
    recentSets.push(set);
    if (recentSets.length === 3) break;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Add expense" sub={template ? `Same as “${template.expense.title}”. Change what's different.` : "Anyone can pay; everyone sees what they owe."} />
      <ExpenseForm
        me={me.id}
        people={people}
        budgets={(budgets ?? []) as { id: string; name: string }[]}
        categories={categories}
        today={today}
        canAddGuests={ctx.perms.has("members.invite")}
        defaultBudget={typeof sp.budget === "string" ? sp.budget : undefined}
        closedThrough={through}
        scanEnabled={receiptScanEnabled()}
        recentSets={recentSets}
        {...(template ? { ...template, copy: true } : {})}
      />
    </div>
  );
}
