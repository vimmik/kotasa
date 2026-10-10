import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listPeople } from "@/lib/ledger";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidDate, todayColombo } from "@/lib/time";
import type { MenuItem, Order } from "@/lib/types";
import { DateNav } from "@/components/week-nav";
import { DayOrdersForm } from "@/components/day-orders-form";

export default async function OrdersPage(props: PageProps<"/admin/orders">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : todayColombo();
  const admin = createAdminClient();
  const [people, { data: menu }, { data: orders }] = await Promise.all([
    listPeople(),
    admin.from("menu_items").select("*").eq("menu_date", date).order("created_at"),
    admin.from("orders").select("*").eq("order_date", date),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted">Enter or fix anyone&apos;s meals, including people who don&apos;t use the app. No cutoff here.</p>
      </div>
      <DateNav base="/admin/orders" date={date} />
      {(menu ?? []).length === 0 ? (
        <div className="card text-sm">
          No menu for this day yet.{" "}
          <Link href={`/admin/menu?date=${date}`} className="font-semibold text-brand underline">Add the menu first</Link>.
        </div>
      ) : (
        <DayOrdersForm key={date} date={date} people={people} menu={(menu ?? []) as MenuItem[]} orders={(orders ?? []) as Order[]} />
      )}
    </div>
  );
}
