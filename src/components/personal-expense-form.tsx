"use client";

import { useActionState, useState } from "react";
import { savePersonalExpense } from "@/app/actions/personal";
import { currencySymbol, money } from "@/lib/currency";
import type { PCategory } from "@/lib/personal";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { ICONS } from "@/components/bits";

type Entry = { id: string; amount: number; title: string; category: string; spent_on: string; note: string | null };

/** The full form: for editing an entry, or adding one with a note or an older date. */
export function PersonalExpenseForm({
  categories,
  currency,
  today,
  entry,
}: {
  categories: PCategory[];
  currency: string;
  today: string;
  entry?: Entry;
}) {
  const [state, action] = useActionState(savePersonalExpense, null);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const shown = categories.filter((c) => !c.archived || c.key === entry?.category);
  const [category, setCategory] = useState(entry?.category ?? "food");
  const total = Number(amount) || 0;

  return (
    <ActionForm action={action} className="card space-y-4">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <input type="hidden" name="category" value={category} />
      <div>
        <label className="label" htmlFor="title">What was it for?</label>
        <input id="title" name="title" defaultValue={entry?.title} className="input" placeholder="Lunch at the canteen" required maxLength={80} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="amount">Amount ({currencySymbol(currency)})</label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            className="input text-lg font-semibold"
            placeholder="450"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="spent_on">Date</label>
          <input id="spent_on" name="spent_on" type="date" max={today} defaultValue={entry?.spent_on ?? today} className="input" required />
        </div>
      </div>
      <div>
        <span className="label">Category</span>
        <div className="flex flex-wrap gap-2">
          {shown.map((c) => {
            const Icon = ICONS[c.icon] ?? ICONS.receipt;
            const on = category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold ${on ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-muted hover:text-ink"}`}
              >
                <Icon size={15} aria-hidden="true" /> {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">Note (optional)</label>
        <textarea id="note" name="note" rows={2} defaultValue={entry?.note ?? ""} className="input" maxLength={300} />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3 text-base">
        {entry ? "Save changes" : `Add${total ? ` · ${money(total, currency)}` : ""}`}
      </SubmitButton>
    </ActionForm>
  );
}
