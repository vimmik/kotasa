"use client";

import { useActionState, useState } from "react";
import { saveDayOrders } from "@/app/actions/meals";
import { FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";
import { rs, type MealSlot, type MemberWithLogin, type MenuItem, type Order } from "@/lib/types";

export function DayOrdersForm({
  date,
  people,
  slots,
  menu,
  orders,
  pooled = {},
}: {
  date: string;
  people: MemberWithLogin[];
  slots: MealSlot[];
  menu: MenuItem[];
  orders: Order[];
  /** shared-bill meals that day -> who has joined */
  pooled?: Record<string, string[]>;
}) {
  const [state, action] = useActionState(saveDayOrders, null);
  const [filter, setFilter] = useState("");
  const find = (pid: string, meal: string) => orders.find((o) => o.person_id === pid && o.meal === meal);

  return (
    <form action={action} className="space-y-3">
      <OrgField />
      <input type="hidden" name="date" value={date} />
      {Object.keys(pooled).map((k) => (
        <input key={k} type="hidden" name="pooled_slots" value={k} />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input type="search" placeholder="Search name" value={filter} onChange={(e) => setFilter(e.target.value)} className="input max-w-xs" />
        <SubmitButton>Save all changes</SubmitButton>
      </div>
      <FormMessage state={state} />
      <ul className="card divide-y divide-line py-1">
        {people.map((p) => (
          <li
            key={p.id}
            style={{ "--slots": slots.length } as React.CSSProperties}
            className={`grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_repeat(var(--slots),minmax(0,1.4fr))] md:items-center ${p.full_name.toLowerCase().includes(filter.toLowerCase()) ? "" : "hidden"}`}
          >
            <div className="font-semibold">
              {p.full_name}
              {!p.registered && <span className="ml-2 pill bg-surface-2 text-muted">SMS only</span>}
            </div>
            {slots.map(({ key: meal, label }) => {
              if (pooled[meal])
                return (
                  <label key={meal} className="flex min-h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`join_${meal}`}
                      value={p.id}
                      defaultChecked={pooled[meal].includes(p.id)}
                      className="size-4 accent-[var(--brand)]"
                      aria-label={`${p.full_name} eating ${label}`}
                    />
                    <span>
                      {label} <span className="text-xs text-muted">(shared bill)</span>
                    </span>
                  </label>
                );
              const o = find(p.id, meal);
              return (
                <div key={meal} className="flex items-center gap-1.5">
                  <span className="w-16 shrink-0 text-xs text-muted md:hidden">{label}</span>
                  <select name={`item_${meal}_${p.id}`} defaultValue={o?.menu_item_id ?? ""} className="input min-w-0 py-1.5" aria-label={`${p.full_name} ${label}`}>
                    <option value="">— no {label.toLowerCase()}</option>
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
