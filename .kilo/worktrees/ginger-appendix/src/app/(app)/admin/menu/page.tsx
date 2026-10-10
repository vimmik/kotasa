import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { addDays, isoWeekday, isValidDate, todayColombo } from "@/lib/time";
import { MEAL_LABEL, MEALS, type MenuItem } from "@/lib/types";
import { DateNav } from "@/components/week-nav";
import { AddMenuItemForm, CopyMenuForm, MenuItemRow } from "@/components/menu-forms";

export default async function MenuPage(props: PageProps<"/admin/menu">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : todayColombo();
  const admin = createAdminClient();
  const [{ data: items }, { data: orders }] = await Promise.all([
    admin.from("menu_items").select("*").eq("menu_date", date).order("created_at"),
    admin.from("orders").select("menu_item_id, qty").eq("order_date", date),
  ]);
  const counts = new Map<string, number>();
  (orders ?? []).forEach((o) => o.menu_item_id && counts.set(o.menu_item_id, (counts.get(o.menu_item_id) ?? 0) + o.qty));
  const prevDay = isoWeekday(date) === 1 ? addDays(date, -3) : addDays(date, -1);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Menu</h1>
      <DateNav base="/admin/menu" date={date} />
      <CopyMenuForm to={date} suggestFrom={prevDay} />
      <div className="grid gap-4 md:grid-cols-2">
        {MEALS.map((meal) => {
          const list = ((items ?? []) as MenuItem[]).filter((i) => i.meal === meal);
          return (
            <section key={meal} className="card">
              <h2 className="text-lg font-extrabold">{MEAL_LABEL[meal]}</h2>
              {list.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No items yet — add what&apos;s available.</p>
              ) : (
                <ul className="mt-1 divide-y divide-line">
                  {list.map((i) => (
                    <MenuItemRow key={i.id} item={i} orders={counts.get(i.id) ?? 0} />
                  ))}
                </ul>
              )}
              <AddMenuItemForm date={date} meal={meal} />
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted">Changing a price also updates that day&apos;s orders. Items already ordered can only be hidden.</p>
    </div>
  );
}
