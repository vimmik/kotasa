"use client";

import { useActionState, useState } from "react";
import { saveDayOrders } from "@/app/actions/meals";
import { FormMessage, SubmitButton } from "@/components/ui";
import { MEAL_LABEL, MEALS, rs, type MenuItem, type Order, type PersonWithLogin } from "@/lib/types";

export function DayOrdersForm({
  date,
  people,
  menu,
  orders,
}: {
  date: string;
  people: PersonWithLogin[];
  menu: MenuItem[];
  orders: Order[];
}) {
  const [state, action] = useActionState(saveDayOrders, null);
  const [filter, setFilter] = useState("");
  const find = (pid: string, meal: string) => orders.find((o) => o.person_id === pid && o.meal === meal);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="date" value={date} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input type="search" placeholder="Search name" value={filter} onChange={(e) => setFilter(e.target.value)} className="input max-w-xs" />
        <SubmitButton>Save all changes</SubmitButton>
      </div>
      <FormMessage state={state} />
      <ul className="card divide-y divide-line py-1">
        {people.map((p) => (
          <li
            key={p.id}
            className={`grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] md:items-center ${p.full_name.toLowerCase().includes(filter.toLowerCase()) ? "" : "hidden"}`}
          >
            <div className="font-semibold">
              {p.full_name}
              {!p.registered && <span className="ml-2 pill bg-surface-2 text-muted">SMS only</span>}
            </div>
            {MEALS.map((meal) => {
              const o = find(p.id, meal);
              return (
                <div key={meal} className="flex items-center gap-1.5">
                  <span className="w-16 shrink-0 text-xs text-muted md:hidden">{MEAL_LABEL[meal]}</span>
                  <select name={`item_${meal}_${p.id}`} defaultValue={o?.menu_item_id ?? ""} className="input min-w-0 py-1.5" aria-label={`${p.full_name} ${meal}`}>
                    <option value="">— no {meal}</option>
                    {menu
                      .filter((i) => i.meal === meal)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({rs(i.price)}){i.available ? "" : " · hidden"}
                        </option>
                      ))}
                  </select>
                  <select name={`qty_${meal}_${p.id}`} defaultValue={o?.qty ?? 1} className="input w-16 py-1.5" aria-label="Packets">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </li>
        ))}
      </ul>
    </form>
  );
}
