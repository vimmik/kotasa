import Link from "next/link";
import { requireMember, requireModule } from "@/lib/auth";
import { listMembers } from "@/lib/ledger";
import { getMealSlots } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { addDays, fmtDay, isPastCutoff, isValidDate, todayColombo, weekStart } from "@/lib/time";
import { rs, type MenuItem, type Order } from "@/lib/types";
import { PageHeader } from "@/components/bits";
import { MealJoin, MealPicker } from "@/components/meal-picker";
import { mealModes } from "@/lib/meals";
import { WeekNav } from "@/components/week-nav";

export default async function MealsPage(props: PageProps<"/g/[slug]/meals">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  requireModule(ctx, "meals");
  const { org, member: me, base } = ctx;
  const sp = await props.searchParams;
  const today = todayColombo();
  const w = typeof sp.week === "string" && isValidDate(sp.week) ? weekStart(sp.week) : weekStart(today);
  const we = addDays(w, 6);

  const db = orgDb(org.id);
  const [slots, { data: menu }, { data: orders }, people, { data: sharedRows }, { data: joinRows }] = await Promise.all([
    getMealSlots(org.id),
    db.select("menu_items").gte("menu_date", w).lte("menu_date", we).order("created_at"),
    db.select("orders").eq("person_id", me.id).gte("order_date", w).lte("order_date", we),
    listMembers(org.id),
    db.select("expenses", "id, title, meal_date, meal, paid_by").gte("meal_date", w).lte("meal_date", we),
    db.select("meal_joins", "join_date, meal, member_id").gte("join_date", w).lte("join_date", we),
  ]);
  const pooled = await mealModes(org.id, slots, w, we);
  const joins = (joinRows ?? []) as { join_date: string; meal: string; member_id: string }[];
  const joinsOf = (d: string, meal: string) => joins.filter((j) => j.join_date === d && j.meal === meal);
  // Shared meal items (family pack, drinks…) this person has a share of.
  const sharedAll = (sharedRows ?? []) as { id: string; title: string; meal_date: string; meal: string; paid_by: string }[];
  const { data: myShareRows } = sharedAll.length
    ? await db.select("expense_shares", "expense_id, amount").eq("person_id", me.id).in("expense_id", sharedAll.map((e) => e.id))
    : { data: [] };
  const myShare = new Map(((myShareRows ?? []) as { expense_id: string; amount: number }[]).map((x) => [x.expense_id, Number(x.amount)]));
  const shared = sharedAll.filter((e) => myShare.has(e.id)).map((e) => ({ ...e, share: myShare.get(e.id)! }));
  const menuItems = (menu ?? []) as MenuItem[];
  const myOrders = (orders ?? []) as Order[];
  const weekTotal = myOrders.reduce((s, o) => s + o.unit_price * o.qty, 0) + shared.reduce((s, e) => s + e.share, 0);
  // Who this week's meals are owed to (the payer can change day by day).
  const payees = [...new Set([...myOrders.map((o) => o.payee_id), ...shared.map((e) => e.paid_by)].filter((id) => id && id !== me.id))]
    .map((id) => people.find((p) => p.id === id)?.full_name.split(" ")[0])
    .filter(Boolean)
    .sort()
    .join(", ");
  const days = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter(
    (d, i) => i < 5 || menuItems.some((m) => m.menu_date === d) || myOrders.some((o) => o.order_date === d),
  );

  return (
    <div className="stagger space-y-4">
      <PageHeader
        title="Meals"
        sub={
          <>
            {rs(weekTotal)} this week{payees ? ` · owed to ${payees}` : ""}
          </>
        }
        action={<WeekNav base={`${base}/meals?`} ws={w} />}
      />
      <div className="space-y-3">
        {days.map((d) => (
          <section key={d} className={`card ${d === today ? "ring-2 ring-brand/40" : ""}`}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold">{fmtDay(d)}</h2>
              {d === today && <span className="pill bg-brand-soft text-brand-strong">Today</span>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {slots.map((slot) => (
                <div key={`${d}-${slot.key}`} className="space-y-2">
                  {pooled(d, slot.key) ? (
                    <MealJoin
                      date={d}
                      slot={slot}
                      joined={joinsOf(d, slot.key).some((j) => j.member_id === me.id)}
                      eaters={joinsOf(d, slot.key).length}
                      menu={menuItems.filter((m) => m.menu_date === d && m.meal === slot.key && m.available).map((m) => m.name)}
                      locked={isPastCutoff(d, slot.cutoff)}
                    />
                  ) : (
                    <MealPicker
                      date={d}
                      slot={slot}
                      items={menuItems.filter((m) => m.menu_date === d && m.meal === slot.key)}
                      order={myOrders.find((o) => o.order_date === d && o.meal === slot.key) ?? null}
                      locked={isPastCutoff(d, slot.cutoff)}
                    />
                  )}
                  {shared
                    .filter((e) => e.meal_date === d && e.meal === slot.key)
                    .map((e) => (
                      <Link
                        key={e.id}
                        href={`${base}/expenses/${e.id}`}
                        className="card-link flex items-center justify-between gap-2 rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber-ink"
                      >
                        <span className="min-w-0">Shared · {e.title}</span>
                        <span className="shrink-0 font-semibold tabular-nums">your share {rs(e.share)}</span>
                      </Link>
                    ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
