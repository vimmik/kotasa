"use client";

import { useActionState } from "react";
import { addMenuItem, copyMenu, deleteMenuItem, updateMenuItem } from "@/app/actions/meals";
import { FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";
import type { MenuItem } from "@/lib/types";

export function AddMenuItemForm({ date, meal }: { date: string; meal: string }) {
  const [state, action] = useActionState(addMenuItem, null);
  return (
    <form action={action} className="mt-3 space-y-2" key={state?.message}>
      <OrgField />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
      <div className="flex gap-2">
        <input name="name" className="input min-w-0 flex-1" placeholder="Rice & chicken curry" required aria-label="Item name" />
        <input name="price" className="input w-24" inputMode="decimal" placeholder="Rs." required aria-label="Price" />
        <SubmitButton className="btn-primary px-3" pendingText="…">Add</SubmitButton>
      </div>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}

export function MenuItemRow({ item, orders }: { item: MenuItem; orders: number }) {
  const [state, action] = useActionState(updateMenuItem, null);
  return (
    <li className="py-2.5">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <OrgField />
        <input type="hidden" name="id" value={item.id} />
        <input name="name" defaultValue={item.name} className="input min-w-36 flex-1 py-1.5" aria-label="Item name" />
        <input name="price" defaultValue={item.price} className="input w-24 py-1.5" inputMode="decimal" aria-label="Price" />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" name="available" defaultChecked={item.available} className="size-4 accent-[var(--brand)]" /> On menu
        </label>
        <SubmitButton className="btn-ghost min-h-9 px-3 py-1" pendingText="…">Save</SubmitButton>
        <button formAction={deleteMenuItem} className="btn-danger min-h-9 px-3 py-1">
          {orders ? "Hide" : "Delete"}
        </button>
        <span className="text-xs text-muted">{orders} ordered</span>
      </form>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </li>
  );
}

export function CopyMenuForm({ to, suggestFrom }: { to: string; suggestFrom: string }) {
  const [state, action] = useActionState(copyMenu, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <OrgField />
      <input type="hidden" name="to" value={to} />
      <span className="text-sm text-muted">Copy menu from</span>
      <input type="date" name="from" defaultValue={suggestFrom} className="input w-auto" aria-label="Copy from date" />
      <SubmitButton className="btn-ghost" pendingText="Copying…">Copy</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
