import "server-only";
import { orgDb } from "@/lib/org-db";
import type { Entry } from "@/lib/insights";
import { daysInMonth } from "@/lib/time";

export type SpendExpense = {
  id: string;
  title: string;
  amount: number;
  category: string;
  paid_by: string;
  expense_date: string;
  expense_shares: { person_id: string; amount: number }[];
};
export type SpendOrder = { person_id: string; unit_price: number; qty: number; payee_id: string | null; order_date: string };
export type MonthSpend = { expenses: SpendExpense[]; orders: SpendOrder[] };

/** Category key that stands for meal orders in a group's Insights. */
export const MEALS_KEY = "__meal_orders";

/** PostgREST returns at most 1000 rows a request; a busy office month of meal orders can pass that. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data } = await page(from, from + 999);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** What the group spent in one month ("YYYY-MM"): every expense, plus meal orders when the group uses meals. */
export async function monthSpend(orgId: string, month: string, meals: boolean): Promise<MonthSpend> {
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(from)).padStart(2, "0")}`;
  const db = orgDb(orgId);
  const [expenses, orders] = await Promise.all([
    all<SpendExpense>((a, b) =>
      db
        .select("expenses", "id, title, amount, category, paid_by, expense_date, expense_shares(person_id, amount)")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false })
        .order("id")
        .range(a, b),
    ),
    meals
      ? all<SpendOrder>((a, b) =>
          db
            .select("orders", "person_id, unit_price, qty, payee_id, order_date")
            .gte("order_date", from)
            .lte("order_date", to)
            .order("id")
            .range(a, b),
        )
      : Promise.resolve([] as SpendOrder[]),
  ]);
  return { expenses, orders };
}

/**
 * Several months at once (oldest first, like `months`). Nothing dated after `today` is
 * returned: tomorrow's meal order isn't spent yet.
 */
export async function monthsSpend(orgId: string, months: string[], meals: boolean, today: string): Promise<MonthSpend[]> {
  const loaded = await Promise.all(months.map((m) => monthSpend(orgId, m, meals)));
  return loaded.map((d) => ({
    expenses: d.expenses.filter((e) => e.expense_date <= today),
    orders: d.orders.filter((o) => o.order_date <= today),
  }));
}

/**
 * The same months as plain entries for lib/insights.ts: everything the group spent, and (with a
 * member) just that member's part of it.
 */
export function spendEntries(data: MonthSpend[], memberId?: string): { everyone: Entry[]; mine: Entry[] } {
  const everyone: Entry[] = [];
  const mine: Entry[] = [];
  for (const d of data) {
    for (const e of d.expenses) {
      everyone.push({ date: e.expense_date, amount: Number(e.amount), category: e.category, title: e.title });
      const share = memberId ? Number(e.expense_shares.find((s) => s.person_id === memberId)?.amount ?? 0) : 0;
      if (share > 0) mine.push({ date: e.expense_date, amount: share, category: e.category, title: e.title });
    }
    for (const o of d.orders) {
      const entry = { date: o.order_date, amount: Number(o.unit_price) * o.qty, category: MEALS_KEY, title: "Meal orders", bulk: true };
      everyone.push(entry);
      if (o.person_id === memberId) mine.push(entry);
    }
  }
  return { everyone, mine };
}
