import Link from "next/link";
import { requirePermission, requireModule } from "@/lib/auth";
import { listMembers } from "@/lib/ledger";
import { getMealSlots } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { isValidDate, todayColombo } from "@/lib/time";
import type { MenuItem, Order } from "@/lib/types";
import { DateNav } from "@/components/week-nav";
import { DayOrdersForm } from "@/components/day-orders-form";
import { mealModes } from "@/lib/meals";

export default async function OrdersPage(props: PageProps<"/g/[slug]/admin/orders">) {
  const { slug } = await props.params;
  const ctx = await requirePermission(slug, "meals.order_for_others");
  requireModule(ctx, "meals");
  const sp = await props.searchParams;
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : todayColombo();
  const db = orgDb(ctx.org.id);
  const [people, { data: menu }, { data: orders }, slots, { data: joinRows }] = await Promise.all([
    listMembers(ctx.org.id),
    db.select("menu_items").eq("menu_date", date).order("created_at"),
    db.select("orders").eq("order_date", date),
    getMealSlots(ctx.org.id),
    db.select("meal_joins", "meal, member_id").eq("join_date", date),
  ]);
  const mode = await mealModes(ctx.org.id, slots, date, date);
  const joins = (joinRows ?? []) as { meal: string; member_id: string }[];
  const pooled = Object.fromEntries(
    slots.filter((s) => mode(date, s.key)).map((s) => [s.key, joins.filter((j) => j.meal === s.key).map((j) => j.member_id)]),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted">Enter or fix anyone&apos;s meals, including people who don&apos;t use the app. No cutoff here.</p>
      </div>
      <DateNav base={`${ctx.base}/admin/orders`} date={date} />
      {(menu ?? []).length === 0 && Object.keys(pooled).length === 0 ? (
        <div className="card text-sm">
          No menu for this day yet.{" "}
          <Link href={`${ctx.base}/admin/menu?date=${date}`} className="font-semibold text-brand underline">Add the menu first</Link>.
        </div>
      ) : (
        <DayOrdersForm key={date} date={date} people={people} slots={slots} menu={(menu ?? []) as MenuItem[]} orders={(orders ?? []) as Order[]} pooled={pooled} />
      )}
    </div>
  );
}
