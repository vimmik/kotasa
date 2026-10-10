import Link from "next/link";
import { requirePermission, requireModule } from "@/lib/auth";
import { listMembers } from "@/lib/ledger";
import { getMealSlots } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { fmtDay, isValidDate, todayColombo } from "@/lib/time";
import { rs, type Expense, type MenuItem, type Order } from "@/lib/types";
import { mealModes } from "@/lib/meals";
import { DateNav } from "@/components/week-nav";
import { PrintButton } from "@/components/ui";
import { MealModeForm, MealPayerForm, SharedItemForm } from "@/components/meal-payer-form";

// Packing / hand-out list so every packet goes to the right person.
export default async function PackingList(props: PageProps<"/g/[slug]/admin/packing">) {
  const { slug } = await props.params;
  const ctx = await requirePermission(slug, "meals.manage_menu");
  requireModule(ctx, "meals");
  const sp = await props.searchParams;
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : todayColombo();
  const db = orgDb(ctx.org.id);
  const [{ data: orders }, people, slots, { data: payerRows }, { data: sharedRows }, { data: joinRows }, { data: menuRows }] = await Promise.all([
    db.select("orders").eq("order_date", date),
    listMembers(ctx.org.id, { includeInactive: true }),
    getMealSlots(ctx.org.id),
    db.select("meal_payers", "meal, member_id").eq("pay_date", date),
    db.select("expenses", "*, expense_shares(person_id)").eq("meal_date", date).order("created_at"),
    db.select("meal_joins", "meal, member_id").eq("join_date", date),
    db.select("menu_items").eq("menu_date", date).eq("available", true).order("created_at"),
  ]);
  const mode = await mealModes(ctx.org.id, slots, date, date);
  const joins = (joinRows ?? []) as { meal: string; member_id: string }[];
  const menu = (menuRows ?? []) as MenuItem[];
  const shared = (sharedRows ?? []) as (Expense & { expense_shares: { person_id: string }[] })[];
  const payers = new Map(((payerRows ?? []) as { meal: string; member_id: string }[]).map((r) => [r.meal, r.member_id]));
  const active = people.filter((p) => p.status === "active");
  const collectorName = ctx.settings.collector_id ? people.find((p) => p.id === ctx.settings.collector_id)?.full_name ?? null : null;
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const list = ((orders ?? []) as Order[]).sort((a, b) =>
    (names.get(a.person_id) ?? "").localeCompare(names.get(b.person_id) ?? ""),
  );
  const dayTotal =
    list.reduce((s, o) => s + o.unit_price * o.qty, 0) + shared.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Packing list · {fmtDay(date)}</h1>
        <PrintButton />
      </div>
      <DateNav base={`${ctx.base}/admin/packing`} date={date} />
      <div className="grid gap-4 md:grid-cols-2">
        {slots.map(({ key: meal, label }) => {
          const pooled = mode(date, meal);
          const eaters = joins.filter((j) => j.meal === meal).map((j) => j.member_id);
          const mo = list.filter((o) => o.meal === meal);
          const byItem = new Map<string, number>();
          mo.forEach((o) => byItem.set(o.item_name, (byItem.get(o.item_name) ?? 0) + o.qty));
          const packets = mo.reduce((s, o) => s + o.qty, 0);
          const items = shared.filter((e) => e.meal === meal);
          const slotTotal =
            mo.reduce((s, o) => s + o.unit_price * o.qty, 0) + items.reduce((s, e) => s + Number(e.amount), 0);
          return (
            <section key={meal} className="card">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{label}</h2>
                <span className="text-sm text-muted">
                  {pooled ? `${eaters.length} eating` : `${packets} packet${packets === 1 ? "" : "s"}`} · {rs(slotTotal)}
                </span>
              </div>
              <MealModeForm key={`${date}-${meal}-${pooled}`} date={date} meal={meal} pooled={pooled} />
              {pooled ? (
                eaters.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">
                    Nobody has joined yet. People join from Meals, or{" "}
                    <Link href={`${ctx.base}/admin/orders?date=${date}`} className="font-semibold text-brand underline">tick them in Orders</Link>.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {eaters
                      .map((id) => names.get(id) ?? "?")
                      .sort()
                      .map((n) => (
                        <span key={n} className="pill bg-brand-soft py-1 text-sm text-brand-strong">{n}</span>
                      ))}
                  </div>
                )
              ) : mo.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No orders.</p>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...byItem.entries()].map(([name, n]) => (
                      <span key={name} className="pill bg-amber-soft py-1 text-sm text-amber-ink">
                        {name} <b className="ml-1">× {n}</b>
                      </span>
                    ))}
                  </div>
                  <table className="tbl mt-3">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Item</th>
                        <th className="text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mo.map((o) => (
                        <tr key={o.id}>
                          <td className="font-semibold">{names.get(o.person_id) ?? "?"}</td>
                          <td>{o.item_name}</td>
                          <td className="text-right font-semibold">{o.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {pooled && mo.length > 0 && (
                <p className="mt-3 rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber-ink">
                  {mo.length} item order{mo.length === 1 ? "" : "s"} were placed before this became a shared bill; they&apos;re still charged.{" "}
                  <Link href={`${ctx.base}/admin/orders?date=${date}`} className="font-semibold underline">Orders</Link>
                </p>
              )}
              {items.length > 0 && (
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {items.map((e) => (
                    <li key={e.id}>
                      <Link href={`${ctx.base}/expenses/${e.id}`} className="card-link flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <b>{e.title}</b>
                          <span className="block text-xs text-muted">
                            Shared by {e.expense_shares.length} ·{" "}
                            {e.expense_shares.map((x) => names.get(x.person_id)?.split(" ")[0] ?? "?").join(", ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-right tabular-nums">
                          <b>{rs(e.amount)}</b>
                          {e.split_type === "equal" && e.expense_shares.length > 1 && (
                            <span className="block text-xs text-muted">{rs(Math.round((e.amount / e.expense_shares.length) * 100) / 100)} each</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <SharedItemForm
                key={`${date}-${meal}-${items.length}-${mo.length}-${eaters.length}-${pooled}`}
                date={date}
                meal={meal}
                label={label}
                people={active}
                eaters={pooled ? eaters : [...new Set(mo.map((o) => o.person_id))]}
                pooled={pooled}
                menu={menu.filter((m) => m.meal === meal).map((m) => ({ name: m.name, price: Number(m.price) }))}
              />
              <MealPayerForm
                key={`${date}-${meal}-${payers.get(meal) ?? ""}`}
                date={date}
                meal={meal}
                label={label}
                payerId={payers.get(meal) ?? null}
                collectorName={collectorName}
                people={active}
              />
            </section>
          );
        })}
      </div>
      <p className="text-sm text-muted">
        Day total <b className="text-ink">{rs(dayTotal)}</b>
      </p>
    </div>
  );
}
