import { getSettings, requireMember } from "@/lib/auth";
import { listPeople } from "@/lib/ledger";
import { createAdminClient } from "@/lib/supabase/server";
import { addDays, fmtDay, isPastCutoff, isValidDate, todayColombo, weekStart } from "@/lib/time";
import { MEALS, rs, type MenuItem, type Order } from "@/lib/types";
import { PageHeader } from "@/components/bits";
import { MealPicker } from "@/components/meal-picker";
import { WeekNav } from "@/components/week-nav";

export default async function MealsPage(props: PageProps<"/meals">) {
  const me = await requireMember();
  const sp = await props.searchParams;
  const today = todayColombo();
  const w = typeof sp.week === "string" && isValidDate(sp.week) ? weekStart(sp.week) : weekStart(today);
  const we = addDays(w, 6);

  const admin = createAdminClient();
  const [settings, { data: menu }, { data: orders }, people] = await Promise.all([
    getSettings(),
    admin.from("menu_items").select("*").gte("menu_date", w).lte("menu_date", we).order("created_at"),
    admin.from("orders").select("*").eq("person_id", me.id).gte("order_date", w).lte("order_date", we),
    listPeople(),
  ]);
  const menuItems = (menu ?? []) as MenuItem[];
  const myOrders = (orders ?? []) as Order[];
  const weekTotal = myOrders.reduce((s, o) => s + o.unit_price * o.qty, 0);
  const collector = people.find((p) => p.id === settings.collector_id)?.full_name;
  const days = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter(
    (d, i) => i < 5 || menuItems.some((m) => m.menu_date === d) || myOrders.some((o) => o.order_date === d),
  );

  return (
    <div className="stagger space-y-4">
      <PageHeader
        title="Meals"
        sub={
          <>
            {rs(weekTotal)} this week{collector && settings.collector_id !== me.id ? ` · paid to ${collector}` : ""}
          </>
        }
        action={<WeekNav base="/meals?" ws={w} />}
      />
      <div className="space-y-3">
        {days.map((d) => (
          <section key={d} className={`card ${d === today ? "ring-2 ring-brand/40" : ""}`}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold">{fmtDay(d)}</h2>
              {d === today && <span className="pill bg-brand-soft text-brand-strong">Today</span>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {MEALS.map((meal) => {
                const cutoff = meal === "breakfast" ? settings.breakfast_cutoff : settings.lunch_cutoff;
                return (
                  <MealPicker
                    key={`${d}-${meal}`}
                    date={d}
                    meal={meal}
                    items={menuItems.filter((m) => m.menu_date === d && m.meal === meal)}
                    order={myOrders.find((o) => o.order_date === d && o.meal === meal) ?? null}
                    locked={isPastCutoff(d, cutoff)}
                    cutoff={cutoff}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
