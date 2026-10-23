"use client";

import { useActionState } from "react";
import { saveBilling, saveCategory, saveGroup, saveMealSlot, saveModules } from "@/app/actions/admin";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";
import { ICONS } from "@/components/bits";
import { WEEKDAYS } from "@/lib/time";
import { CATEGORY_ICON_NAMES, type Category, type MealSlot, type OrgSettings } from "@/lib/types";

export function GroupForm({ name }: { name: string }) {
  const [state, action] = useActionState(saveGroup, null);
  return (
    <ActionForm action={action} className="card space-y-3">
      <OrgField />
      <h2 className="font-semibold">Group</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" defaultValue={name} maxLength={60} className="input" required />
        </div>
        <SubmitButton className="btn-ghost">Save</SubmitButton>
      </div>
      <FormMessage state={state} />
    </ActionForm>
  );
}

function Toggle({ name, label, hint, on }: { name: string; label: string; hint: string; on: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-line p-3">
      <input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 size-4 accent-[var(--brand)]" />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

export function ModulesForm({ s }: { s: OrgSettings }) {
  const [state, action] = useActionState(saveModules, null);
  return (
    <ActionForm action={action} className="card space-y-3">
      <OrgField />
      <div>
        <h2 className="font-semibold">Modules</h2>
        <p className="text-xs text-muted">Turn on what this group uses. Expenses and settling up are always on.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle name="meals_enabled" label="Meals" hint="Daily menu, orders with cutoffs, packing list" on={s.meals_enabled} />
        <Toggle name="budgets_enabled" label="Budgets" hint="Pots with an optional limit, like a trip fund" on={s.budgets_enabled} />
        {s.simplify_debts !== undefined && (
          <Toggle
            name="simplify_debts"
            label="Fewest payments"
            hint="Cut out the middle person when it saves a payment. People only pay someone they shared with, or the collector; totals stay the same."
            on={s.simplify_debts}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-ghost">Save modules</SubmitButton>
        <FormMessage state={state} />
      </div>
    </ActionForm>
  );
}

function IconSelect({ value }: { value: string }) {
  return (
    <select name="icon" defaultValue={value} className="input w-auto py-1.5" aria-label="Icon">
      {CATEGORY_ICON_NAMES.map((n) => (
        <option key={n} value={n}>
          {n.replace("-", " ")}
        </option>
      ))}
    </select>
  );
}

function CategoryRow({ c }: { c: Category }) {
  const [state, action] = useActionState(saveCategory, null);
  const Icon = ICONS[c.icon] ?? ICONS.receipt;
  return (
    <li className="py-2">
      <ActionForm action={action} className="flex flex-wrap items-center gap-2">
        <OrgField />
        <input type="hidden" name="key" value={c.key} />
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <Icon size={16} aria-hidden="true" />
        </span>
        <input name="label" defaultValue={c.label} maxLength={30} className="input min-w-32 flex-1 py-1.5" aria-label="Category name" />
        <IconSelect value={c.icon} />
        {c.key !== "other" && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" name="archived" defaultChecked={c.archived} className="size-4 accent-[var(--brand)]" /> Archived
          </label>
        )}
        <SubmitButton className="btn-ghost min-h-9 px-3 py-1" pendingText="…">
          Save
        </SubmitButton>
      </ActionForm>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </li>
  );
}

export function CategoriesEditor({ categories }: { categories: Category[] }) {
  const [state, action] = useActionState(saveCategory, null);
  return (
    <section className="card space-y-2">
      <div>
        <h2 className="font-semibold">Expense categories</h2>
        <p className="text-xs text-muted">Archived categories stay on old expenses but can&apos;t be picked for new ones.</p>
      </div>
      <ul className="divide-y divide-line">
        {categories.map((c) => (
          <CategoryRow key={c.key} c={c} />
        ))}
      </ul>
      <ActionForm action={action} className="flex flex-wrap items-center gap-2 border-t border-line pt-3" key={state?.message}>
        <OrgField />
        <input name="label" maxLength={30} className="input min-w-40 flex-1 py-1.5" placeholder="New category, like Snacks" required aria-label="New category name" />
        <IconSelect value="receipt" />
        <SubmitButton className="btn-primary min-h-9 px-3 py-1" pendingText="…">
          Add
        </SubmitButton>
      </ActionForm>
      <FormMessage state={state} />
    </section>
  );
}

function SlotRow({ s }: { s: MealSlot }) {
  const [state, action] = useActionState(saveMealSlot, null);
  return (
    <li className="py-2">
      <ActionForm action={action} className="flex flex-wrap items-center gap-2">
        <OrgField />
        <input type="hidden" name="key" value={s.key} />
        <input name="label" defaultValue={s.label} maxLength={30} className="input min-w-32 flex-1 py-1.5" aria-label="Meal name" />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Order by
          <input name="cutoff" type="time" defaultValue={s.cutoff.slice(0, 5)} className="input w-auto py-1.5" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted" title="A few portions are bought and the bill is split among who eats">
          <input type="checkbox" name="pooled" defaultChecked={s.pooled} className="size-4 accent-[var(--brand)]" /> Shared bill
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" name="archived" defaultChecked={s.archived} className="size-4 accent-[var(--brand)]" /> Archived
        </label>
        <SubmitButton className="btn-ghost min-h-9 px-3 py-1" pendingText="…">
          Save
        </SubmitButton>
      </ActionForm>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </li>
  );
}

export function MealSlotsEditor({ slots }: { slots: MealSlot[] }) {
  const [state, action] = useActionState(saveMealSlot, null);
  return (
    <section className="card space-y-2">
      <div>
        <h2 className="font-semibold">Meals</h2>
        <p className="text-xs text-muted">
          Each meal has its own menu and an order cutoff (Sri Lanka time). <b>Shared bill</b>: people just join, a few
          portions are bought, and the bill is split equally among who ate. Off: everyone orders their own item.
        </p>
      </div>
      <ul className="divide-y divide-line">
        {slots.map((s) => (
          <SlotRow key={s.key} s={s} />
        ))}
      </ul>
      <ActionForm action={action} className="flex flex-wrap items-center gap-2 border-t border-line pt-3" key={state?.message}>
        <OrgField />
        <input name="label" maxLength={30} className="input min-w-40 flex-1 py-1.5" placeholder="New meal, like Evening tea" required aria-label="New meal name" />
        <input name="cutoff" type="time" defaultValue="15:00" className="input w-auto py-1.5" aria-label="Order cutoff" />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" name="pooled" className="size-4 accent-[var(--brand)]" /> Shared bill
        </label>
        <SubmitButton className="btn-primary min-h-9 px-3 py-1" pendingText="…">
          Add
        </SubmitButton>
      </ActionForm>
      <FormMessage state={state} />
    </section>
  );
}

export function BillingForm({ s, people }: { s: OrgSettings; people: { id: string; name: string }[] }) {
  const [state, action] = useActionState(saveBilling, null);
  return (
    <ActionForm action={action} className="card grid gap-4 sm:grid-cols-3">
      <OrgField />
      <h2 className="font-semibold sm:col-span-3">Weekly bill and SMS</h2>
      <div className="sm:col-span-3">
        <label className="label" htmlFor="collector_id">Meal and SMS collector</label>
        <select id="collector_id" name="collector_id" defaultValue={s.collector_id ?? ""} className="input sm:max-w-sm">
          <option value="">Nobody</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">Pays the food vendor and the SMS bill; meal orders and SMS fees are owed to them.</p>
      </div>
      <div>
        <label className="label" htmlFor="billing_weekday">Send on (last working day)</label>
        <select id="billing_weekday" name="billing_weekday" defaultValue={s.billing_weekday} className="input">
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="sms_send_hour">From hour (0–23)</label>
        <input id="sms_send_hour" name="sms_send_hour" type="number" min={0} max={23} defaultValue={s.sms_send_hour} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="sms_fee">SMS fee per person (Rs.)</label>
        <input id="sms_fee" name="sms_fee" inputMode="decimal" defaultValue={s.sms_fee} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="sms_monthly_cap">Monthly SMS limit</label>
        <input id="sms_monthly_cap" name="sms_monthly_cap" type="number" min={0} max={5000} defaultValue={s.sms_monthly_cap} className="input" />
      </div>
      <label className="flex items-start gap-2 text-sm sm:col-span-2 sm:self-end">
        <input type="checkbox" name="sms_enabled" defaultChecked={s.sms_enabled} className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span>
          <b>Really send SMS.</b> When off, sends are logged as a dry run. Nothing is sent or charged.
        </span>
      </label>
      {s.pay_note !== undefined && (
        <div className="sm:col-span-3">
          <label className="label" htmlFor="pay_note">How to pay (optional)</label>
          <textarea
            id="pay_note"
            name="pay_note"
            defaultValue={s.pay_note ?? ""}
            rows={2}
            maxLength={300}
            className="input"
            placeholder="BOC 1234567, K. Dinajara · or cash to Kavi at the office"
          />
          <p className="mt-1 text-xs text-muted">Shown on everyone&apos;s bill link and on Home when they owe, so they know where to send the money.</p>
        </div>
      )}
      <div className="sm:col-span-3">
        <label className="label" htmlFor="sms_template">Message</label>
        <textarea id="sms_template" name="sms_template" defaultValue={s.sms_template} rows={3} className="input font-mono text-sm" />
        <p className="mt-1 text-xs text-muted">
          {"{name} {full_name} {week} {owe_lines} {total} {link} {group} {app}"}. Must include {"{total}"} and {"{link}"}.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <SubmitButton>Save billing</SubmitButton>
        <FormMessage state={state} />
      </div>
    </ActionForm>
  );
}
