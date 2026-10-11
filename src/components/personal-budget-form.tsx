"use client";

import { useActionState, useState } from "react";
import { Sparkle } from "@phosphor-icons/react/ssr";
import { savePersonalBudget } from "@/app/actions/personal";
import { currencySymbol, money } from "@/lib/currency";
import { PERIODS, type Period } from "@/lib/periods";
import type { PBudget, PCategory } from "@/lib/personal";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { ICONS } from "@/components/bits";

type Props = {
  categories: PCategory[];
  currency: string;
  today: string;
  payday: number | null;
  /** Suggested amount per period, from take-home pay. Missing when no income is set. */
  suggestions: Partial<Record<Period, number>>;
  budget?: PBudget;
  /** Ticked "main" by default (first budget, or opened from "Set my budget") */
  mainDefault?: boolean;
};

const NAMES: Record<Period, string> = {
  day: "Daily spending",
  week: "Weekly spending",
  month: "Monthly spending",
  payday: "Pay cycle spending",
  year: "This year",
  custom: "Trip",
};

export function PersonalBudgetForm({ categories, currency, today, payday, suggestions, budget, mainDefault }: Props) {
  const [state, action] = useActionState(savePersonalBudget, null);
  const [period, setPeriod] = useState<Period>(budget?.period ?? "month");
  const [amount, setAmount] = useState(budget ? String(budget.amount) : "");
  const [name, setName] = useState(budget?.name ?? NAMES.month);
  const [nameTouched, setNameTouched] = useState(!!budget);
  const [cats, setCats] = useState<Set<string>>(new Set(budget?.categories ?? []));
  const [rollover, setRollover] = useState(budget?.rollover === "carry");
  const suggestion = suggestions[period];
  const shown = categories.filter((c) => !c.archived || cats.has(c.key));

  const toggle = (k: string) =>
    setCats((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <ActionForm action={action} className="space-y-4">
      {budget && <input type="hidden" name="id" value={budget.id} />}
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="rollover" value={rollover && period !== "custom" ? "carry" : "off"} />
      {[...cats].map((k) => (
        <input key={k} type="hidden" name="categories" value={k} />
      ))}

      <section className="card space-y-4">
        <div>
          <span className="label">How often does it start again?</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={period === p.id}
                onClick={() => {
                  setPeriod(p.id);
                  if (!nameTouched) setName(NAMES[p.id]);
                }}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${period === p.id ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-muted hover:text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === "payday" && (
          <div>
            <label className="label" htmlFor="payday">Which day of the month are you paid?</label>
            <select id="payday" name="payday" defaultValue={payday ?? 25} className="input">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">Paid on the 29th or later? Pick 28.</p>
          </div>
        )}

        {period === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="starts_on">First day</label>
              <input id="starts_on" name="starts_on" type="date" defaultValue={budget?.starts_on ?? today} className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="ends_on">Last day</label>
              <input id="ends_on" name="ends_on" type="date" defaultValue={budget?.ends_on ?? ""} className="input" required />
            </div>
          </div>
        )}
        {period !== "custom" && budget && <input type="hidden" name="starts_on" value={budget.starts_on} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="amount">
              How much, {PERIODS.find((p) => p.id === period)?.every} ({currencySymbol(currency)})
            </label>
            <input
              id="amount"
              name="amount"
              inputMode="decimal"
              className="input text-lg font-semibold"
              placeholder="60000"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              required
            />
            {suggestion && Number(amount) !== suggestion && (
              <button
                type="button"
                onClick={() => setAmount(String(suggestion))}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand"
              >
                <Sparkle size={13} aria-hidden="true" /> Use {money(suggestion, currency)}, from your take-home pay
              </button>
            )}
          </div>
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
              className="input"
              maxLength={60}
              required
            />
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">What counts</h2>
          <p className="text-sm text-muted">
            {cats.size === 0 ? "All your spending counts. Pick categories to track only those." : `Only ${cats.size === 1 ? "this category" : "these categories"} count.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={cats.size === 0}
            onClick={() => setCats(new Set())}
            className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${cats.size === 0 ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-muted hover:text-ink"}`}
          >
            All spending
          </button>
          {shown.map((c) => {
            const Icon = ICONS[c.icon] ?? ICONS.receipt;
            const on = cats.has(c.key);
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c.key)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold ${on ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-muted hover:text-ink"}`}
              >
                <Icon size={15} aria-hidden="true" /> {c.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3">
        {period !== "custom" && (
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} className="mt-1 size-4 accent-[var(--brand)]" />
            <span>
              <span className="block font-semibold">Carry over what&apos;s left</span>
              <span className="block text-sm text-muted">
                Money you don&apos;t spend is added to the next {period === "payday" ? "pay cycle" : period}. Overspending is taken from it.
              </span>
            </span>
          </label>
        )}
        <label className="flex items-start gap-3">
          <input type="checkbox" name="is_main" defaultChecked={budget?.is_main ?? mainDefault} className="mt-1 size-4 accent-[var(--brand)]" />
          <span>
            <span className="block font-semibold">Main budget</span>
            <span className="block text-sm text-muted">Shown at the top of Today, with how much is safe to spend each day.</span>
          </span>
        </label>
      </section>

      <FormMessage state={state} />
      <div className="sticky bottom-20 z-10 md:bottom-4">
        <SubmitButton className="btn-primary w-full py-3 text-base shadow-lg">{budget ? "Save budget" : "Create budget"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
