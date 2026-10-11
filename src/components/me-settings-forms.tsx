"use client";

import { useActionState, useState } from "react";
import { Archive, ArrowCounterClockwise, PencilSimple } from "@phosphor-icons/react/ssr";
import {
  saveMoneySettings,
  savePersonalCategory,
  setCategoryMap,
  setGroupFeed,
  toggleCategoryArchived,
} from "@/app/actions/personal";
import { CURRENCIES, currencySymbol } from "@/lib/currency";
import type { GroupFeed, PCategory } from "@/lib/personal";
import { CATEGORY_ICON_NAMES } from "@/lib/types";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { ICONS } from "@/components/bits";

export function MoneySettingsForm({ currency, income, payday }: { currency: string; income: number | null; payday: number | null }) {
  const [state, action] = useActionState(saveMoneySettings, null);
  const [cur, setCur] = useState(currency);
  return (
    <ActionForm action={action} className="card space-y-4">
      <h2 className="font-semibold">Money</h2>
      <div>
        <label className="label" htmlFor="currency">Currency</label>
        <select id="currency" name="currency" value={cur} onChange={(e) => setCur(e.target.value)} className="input">
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.label}
            </option>
          ))}
        </select>
        {cur !== currency && (
          <p className="mt-1 text-xs text-amber-ink">
            Amounts you already added aren&apos;t converted. Groups in other currencies stop counting towards your totals.
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="monthly_income">Take-home pay a month ({currencySymbol(cur)}, optional)</label>
          <input
            id="monthly_income"
            name="monthly_income"
            inputMode="decimal"
            defaultValue={income ?? ""}
            className="input"
            placeholder="85000"
          />
          <p className="mt-1 text-xs text-muted">Only used to suggest budgets. Nobody else sees it.</p>
        </div>
        <div>
          <label className="label" htmlFor="payday">Payday (optional)</label>
          <select id="payday" name="payday" defaultValue={payday ?? ""} className="input">
            <option value="">Not set</option>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">For payday-to-payday budgets. Paid on the 29th or later? Pick 28.</p>
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
      {CATEGORY_ICON_NAMES.map((name) => {
        const Icon = ICONS[name];
        const on = value === name;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={name.replace("-", " ")}
            onClick={() => onChange(name)}
            className={`inline-flex size-9 items-center justify-center rounded-xl border ${on ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-muted hover:text-ink"}`}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** Add a category, or rename one / change its icon. */
export function CategoryForm({ category, onDone }: { category?: PCategory; onDone?: () => void }) {
  const [state, action] = useActionState(async (prev: Parameters<typeof savePersonalCategory>[0], f: FormData) => {
    const res = await savePersonalCategory(prev, f);
    if (res?.ok) onDone?.();
    return res;
  }, null);
  const [icon, setIcon] = useState(category?.icon ?? "receipt");
  return (
    <ActionForm action={action} className="space-y-3" key={category?.key ?? "new"}>
      {category && <input type="hidden" name="key" value={category.key} />}
      <input type="hidden" name="icon" value={icon} />
      <div>
        <label className="label" htmlFor={`label-${category?.key ?? "new"}`}>Name</label>
        <input
          id={`label-${category?.key ?? "new"}`}
          name="label"
          defaultValue={category?.label}
          className="input"
          placeholder="Kids, Pets, Gym…"
          maxLength={30}
          required
        />
      </div>
      <IconPicker value={icon} onChange={setIcon} />
      <FormMessage state={state?.ok ? null : state} />
      <div className="flex gap-2">
        <SubmitButton>{category ? "Save" : "Add category"}</SubmitButton>
        {onDone && (
          <button type="button" className="btn-ghost" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </ActionForm>
  );
}

export function CategoryList({ categories }: { categories: PCategory[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold">Categories</h2>
        <p className="text-sm text-muted">Archived ones stay on old entries but aren&apos;t offered for new ones.</p>
      </div>
      <ul className="divide-y divide-line">
        {categories.map((c) => {
          const Icon = ICONS[c.icon] ?? ICONS.receipt;
          if (editing === c.key)
            return (
              <li key={c.key} className="py-3">
                <CategoryForm category={c} onDone={() => setEditing(null)} />
              </li>
            );
          return (
            <li key={c.key} className={`flex items-center gap-3 py-2 ${c.archived ? "opacity-60" : ""}`}>
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-surface-2 text-muted">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="flex-1 font-medium">
                {c.label}
                {c.archived && <span className="ml-2 pill bg-surface-2 text-muted">Archived</span>}
              </span>
              <button type="button" className="btn-ghost px-2.5" aria-label={`Edit ${c.label}`} onClick={() => setEditing(c.key)}>
                <PencilSimple size={16} aria-hidden="true" />
              </button>
              {c.key !== "other" && (
                <form action={toggleCategoryArchived}>
                  <input type="hidden" name="key" value={c.key} />
                  <button className="btn-ghost px-2.5" aria-label={c.archived ? `Bring back ${c.label}` : `Archive ${c.label}`}>
                    {c.archived ? <ArrowCounterClockwise size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <div className="rounded-2xl border border-line p-3">
          <CategoryForm onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" className="btn-ghost w-full" onClick={() => setAdding(true)}>
          Add a category
        </button>
      )}
    </section>
  );
}

/** One group: does it feed into Me, and where its categories land. Changes save straight away. */
export function GroupFeedCard({ feed, categories, myCurrency }: { feed: GroupFeed; categories: PCategory[]; myCurrency: string }) {
  const active = categories.filter((c) => !c.archived);
  const label = new Map(categories.map((c) => [c.key, c.label]));
  const submit = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => e.currentTarget.form?.requestSubmit();
  return (
    <li className="space-y-2 py-3">
      <form action={setGroupFeed} className="flex items-center gap-3">
        <input type="hidden" name="org_id" value={feed.orgId} />
        <input type="hidden" name="enabled" value={feed.enabled ? "0" : "1"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{feed.name}</span>
          {feed.currency !== myCurrency && (
            <span className="block text-xs text-amber-ink">Uses {feed.currency}, so it&apos;s listed but not counted</span>
          )}
        </span>
        <button
          role="switch"
          aria-checked={feed.enabled}
          aria-label={`Include ${feed.name} in Me`}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${feed.enabled ? "bg-brand" : "bg-surface-2 ring-1 ring-line"}`}
        >
          <span className={`absolute top-1 size-5 rounded-full bg-surface shadow transition-all ${feed.enabled ? "left-6" : "left-1"}`} />
        </button>
      </form>
      {feed.enabled && (
        <details className="group rounded-xl bg-surface-2 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-semibold text-muted">Where its categories go</summary>
          <ul className="mt-2 space-y-1.5">
            {feed.categories.map((c) => (
              <li key={c.key}>
                <form action={setCategoryMap} className="flex items-center gap-2 text-sm">
                  <input type="hidden" name="org_id" value={feed.orgId} />
                  <input type="hidden" name="org_category" value={c.key} />
                  <label htmlFor={`map-${feed.orgId}-${c.key}`} className="min-w-0 flex-1 truncate">
                    {c.label}
                  </label>
                  <select
                    id={`map-${feed.orgId}-${c.key}`}
                    name="personal_key"
                    defaultValue={c.mapped ?? ""}
                    onChange={submit}
                    className="input w-40 py-1 text-sm"
                  >
                    <option value="">{label.get(c.fallback) ?? "Other"} (auto)</option>
                    {active.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
