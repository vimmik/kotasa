import { requireAdmin } from "@/lib/auth";
import { listPeople } from "@/lib/ledger";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDay, isValidDate, todayColombo } from "@/lib/time";
import { MEAL_LABEL, MEALS, rs, type Order } from "@/lib/types";
import { DateNav } from "@/components/week-nav";
import { PrintButton } from "@/components/ui";

// Packing / hand-out list so every packet goes to the right person.
export default async function PackingList(props: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : todayColombo();
  const [{ data: orders }, people] = await Promise.all([
    createAdminClient().from("orders").select("*").eq("order_date", date),
    listPeople({ includeInactive: true }),
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const list = ((orders ?? []) as Order[]).sort((a, b) =>
    (names.get(a.person_id) ?? "").localeCompare(names.get(b.person_id) ?? ""),
  );
  const dayTotal = list.reduce((s, o) => s + o.unit_price * o.qty, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Packing list · {fmtDay(date)}</h1>
        <PrintButton />
      </div>
      <DateNav base="/admin" date={date} />
      <div className="grid gap-4 md:grid-cols-2">
        {MEALS.map((meal) => {
          const mo = list.filter((o) => o.meal === meal);
          const byItem = new Map<string, number>();
          mo.forEach((o) => byItem.set(o.item_name, (byItem.get(o.item_name) ?? 0) + o.qty));
          const packets = mo.reduce((s, o) => s + o.qty, 0);
          return (
            <section key={meal} className="card">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{MEAL_LABEL[meal]}</h2>
                <span className="text-sm text-muted">{packets} packet{packets === 1 ? "" : "s"}</span>
              </div>
              {mo.length === 0 ? (
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
