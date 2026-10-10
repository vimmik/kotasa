"use client";

import { useActionState, useRef } from "react";
import { Lock } from "@phosphor-icons/react/ssr";
import { joinMeal, saveMyOrder } from "@/app/actions/meals";
import { OrgField } from "@/components/org-field";
import { rs, type MealSlot, type MenuItem, type Order } from "@/lib/types";

export function MealPicker({
  date,
  slot,
  items,
  order,
  locked,
}: {
  date: string;
  slot: MealSlot;
  items: MenuItem[];
  order: Order | null;
  locked: boolean;
}) {
  const meal = slot.key;
  const cutoff = slot.cutoff;
  const [state, action, pending] = useActionState(saveMyOrder, null);
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();
  const visible = items.filter((i) => i.available || i.id === order?.menu_item_id);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <OrgField />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{slot.label}</h3>
        <span className="flex items-center gap-1 text-xs text-muted">
          {pending ? "Saving…" : locked ? (<><Lock size={12} aria-hidden="true" /> Closed</>) : `Order by ${cutoff.slice(0, 5)}`}
        </span>
      </div>

      {locked ? (
        <p className={`rounded-xl px-3 py-2.5 text-sm ${order ? "bg-brand-soft font-semibold text-brand-strong" : "bg-surface-2 text-muted"}`}>
          {order ? `${order.item_name}${order.qty > 1 ? ` × ${order.qty}` : ""} · ${rs(order.unit_price * order.qty)}` : "Nothing ordered"}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">Menu not added yet</p>
      ) : (
        <>
          <div className="grid gap-1.5">
            <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm ${!order ? "border-ink/25 bg-surface-2" : "border-line"}`}>
              <input type="radio" name="menu_item_id" value="" defaultChecked={!order} onChange={submit} className="size-4 accent-[var(--brand)]" />
              <span className="text-muted">No {slot.label.toLowerCase()} for me</span>
            </label>
            {visible.map((i) => (
              <label
                key={i.id}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm ${order?.menu_item_id === i.id ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}
              >
                <input type="radio" name="menu_item_id" value={i.id} defaultChecked={order?.menu_item_id === i.id} onChange={submit} className="size-4 accent-[var(--brand)]" />
                <span className="flex-1 font-medium">{i.name}</span>
                <span className="text-muted tabular-nums">{rs(i.price)}</span>
              </label>
            ))}
          </div>
          {order && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Packets</span>
              <select name="qty" defaultValue={order.qty} onChange={submit} className="input w-20 py-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

/** A shared-bill meal: no item to pick, you just say you're eating. The bill is split among everyone in. */
export function MealJoin({
  date,
  slot,
  joined,
  eaters,
  menu,
  locked,
}: {
  date: string;
  slot: MealSlot;
  joined: boolean;
  /** how many people are in so far */
  eaters: number;
  /** what's being bought, for information */
  menu: string[];
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(joinMeal, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="space-y-2">
      <OrgField />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={slot.key} />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {slot.label} <span className="pill ml-1 bg-amber-soft text-amber-ink">Shared bill</span>
        </h3>
        <span className="flex items-center gap-1 text-xs text-muted">
          {pending ? "Saving…" : locked ? (<><Lock size={12} aria-hidden="true" /> Closed</>) : `Join by ${slot.cutoff.slice(0, 5)}`}
        </span>
      </div>
      {locked ? (
        <p className={`rounded-xl px-3 py-2.5 text-sm ${joined ? "bg-brand-soft font-semibold text-brand-strong" : "bg-surface-2 text-muted"}`}>
          {joined ? `You ate · ${eaters} sharing the bill` : "Not eating"}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { v: "1", label: "I'm eating", on: joined },
            { v: "0", label: "Not for me", on: !joined },
          ].map((o) => (
            <label
              key={o.v}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm ${o.on ? (o.v === "1" ? "border-brand bg-brand-soft font-medium" : "border-ink/25 bg-surface-2") : "border-line hover:bg-surface-2"}`}
            >
              <input
                type="radio"
                name="eating"
                value={o.v}
                defaultChecked={o.on}
                onChange={() => formRef.current?.requestSubmit()}
                className="size-4 accent-[var(--brand)]"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        {menu.length ? `Getting ${menu.join(" + ")}. ` : ""}
        {!locked && `${eaters} in so far. `}The bill is split equally among everyone eating.
      </p>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
