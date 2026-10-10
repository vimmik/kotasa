"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { addGuest, saveExpense } from "@/app/actions/expenses";
import { FormMessage, SubmitButton } from "@/components/ui";
import { CATEGORY_ICON } from "@/components/bits";
import { splitEqually } from "@/lib/split";
import { BRAND } from "@/lib/brand";
import { CATEGORIES, rs, round2, type Budget, type Expense, type PersonWithLogin } from "@/lib/types";

type Props = {
  me: string;
  people: PersonWithLogin[];
  budgets: Pick<Budget, "id" | "name">[];
  today: string;
  expense?: Expense;
  shares?: Record<string, number>;
  defaultBudget?: string;
};

export function ExpenseForm({ me, people, budgets, today, expense, shares, defaultBudget }: Props) {
  const [state, action] = useActionState(saveExpense, null);
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [category, setCategory] = useState(expense?.category ?? "food");
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? me);
  const [splitType, setSplitType] = useState<"equal" | "custom">(expense?.split_type ?? "equal");
  const [selected, setSelected] = useState<Set<string>>(new Set(shares ? Object.keys(shares) : [me]));
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(shares ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [filter, setFilter] = useState("");

  const total = Number(amount) || 0;
  const ids = people.filter((p) => selected.has(p.id)).map((p) => p.id);
  const equal: Record<string, number> =
    ids.length && total > 0 ? Object.fromEntries(splitEqually(total, ids).map((s) => [s.person_id, s.amount])) : {};
  const customSum = round2(ids.reduce((s, id) => s + (Number(custom[id]) || 0), 0));
  const left = round2(total - customSum);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const shown = people.filter((p) => p.full_name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        {expense && <input type="hidden" name="id" value={expense.id} />}
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="split_type" value={splitType} />
        {ids.map((id) => (
          <input key={id} type="hidden" name="participants" value={id} />
        ))}

        <section className="card space-y-4">
          <div>
            <label className="label" htmlFor="title">What was it for?</label>
            <input id="title" name="title" defaultValue={expense?.title} className="input" placeholder="Uber to the client meeting" required maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="amount">Amount (Rs.)</label>
              <input
                id="amount"
                name="amount"
                inputMode="decimal"
                className="input text-lg font-bold"
                placeholder="1200"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="expense_date">Date</label>
              <input id="expense_date" name="expense_date" type="date" defaultValue={expense?.expense_date ?? today} className="input" required />
            </div>
          </div>
          <div>
            <span className="label">Category</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c.id];
                const on = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    aria-pressed={on}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold ${on ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-muted hover:text-ink"}`}
                  >
                    <Icon size={15} aria-hidden="true" /> {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="paid_by">Paid by</label>
              <select id="paid_by" name="paid_by" className="input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === me ? `You (${p.full_name})` : p.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="budget_id">Budget (optional)</label>
              <select id="budget_id" name="budget_id" className="input" defaultValue={expense?.budget_id ?? defaultBudget ?? ""}>
                <option value="">No budget</option>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Split between {ids.length ? `${ids.length} ${ids.length === 1 ? "person" : "people"}` : ""}</h2>
            <div className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5 text-xs font-semibold">
              {(["equal", "custom"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSplitType(t)}
                  aria-pressed={splitType === t}
                  className={`rounded-[10px] px-3 py-1.5 ${splitType === t ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted"}`}
                >
                  {t === "equal" ? "Equally" : "Custom amounts"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input type="search" placeholder="Search people" value={filter} onChange={(e) => setFilter(e.target.value)} className="input" />
            <button type="button" className="btn-ghost shrink-0 px-3 text-xs" onClick={() => setSelected(new Set(people.map((p) => p.id)))}>
              All
            </button>
            <button type="button" className="btn-ghost shrink-0 px-3 text-xs" onClick={() => setSelected(new Set())}>
              None
            </button>
          </div>

          <ul className="divide-y divide-line">
            {shown.map((p) => {
              const on = selected.has(p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-pressed={on}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${on ? "border-brand bg-brand text-brand-ink" : "border-line"}`}>
                      {on && <Check size={14} aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 truncate font-medium">
                      {p.id === me ? "You" : p.full_name}
                      {!p.registered && <span className="ml-2 pill bg-surface-2 text-muted">SMS only</span>}
                    </span>
                  </button>
                  {on &&
                    (splitType === "equal" ? (
                      <span className="text-sm text-muted tabular-nums">{equal[p.id] !== undefined ? rs(equal[p.id]) : ""}</span>
                    ) : (
                      <input
                        name={`share_${p.id}`}
                        inputMode="decimal"
                        aria-label={`${p.full_name}'s share`}
                        className="input w-28 py-1.5 text-right"
                        placeholder="0"
                        value={custom[p.id] ?? ""}
                        onChange={(e) => setCustom((c) => ({ ...c, [p.id]: e.target.value.replace(/[^\d.]/g, "") }))}
                      />
                    ))}
                </li>
              );
            })}
          </ul>
          {splitType === "custom" && total > 0 && (
            <p className={`text-sm font-semibold ${Math.abs(left) < 0.01 ? "text-brand" : "text-danger"}`}>
              {Math.abs(left) < 0.01 ? "Adds up" : left > 0 ? `${rs(left)} left to assign` : `${rs(-left)} too much`}
            </p>
          )}
        </section>

        <section className="card">
          <label className="label" htmlFor="note">Note (optional)</label>
          <textarea id="note" name="note" rows={2} defaultValue={expense?.note ?? ""} className="input" placeholder="Bill photo is in the group chat" />
        </section>

        <FormMessage state={state} />
        <div className="sticky bottom-20 z-10 md:bottom-4">
          <SubmitButton className="btn-primary w-full py-3 text-base shadow-lg" pendingText="Saving…">
            {expense ? "Save changes" : `Add expense${total ? ` · ${rs(total)}` : ""}`}
          </SubmitButton>
        </div>
      </form>

      <AddGuest onAdded={(id) => setSelected((s) => new Set(s).add(id))} />
    </div>
  );
}

/** Add someone who isn't on the app yet — they'll get their bill by SMS. */
export function AddGuest({ onAdded }: { onAdded?: (id: string) => void }) {
  const [state, action] = useActionState(addGuest, null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (state?.personId && onAdded) onAdded(state.personId);
  }, [state?.personId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open)
    return (
      <button type="button" className="btn-ghost w-full" onClick={() => setOpen(true)}>
        <UserPlus size={16} aria-hidden="true" /> Add someone who isn&apos;t on {BRAND.name} yet
      </button>
    );
  return (
    <form action={action} className="card space-y-3" key={state?.personId}>
      <div>
        <h3 className="font-bold">Add a person</h3>
        <p className="text-xs text-muted">They don&apos;t need the app. Their weekly bill goes by SMS with a link to see the details.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="full_name" className="input" placeholder="Name" required />
        <input name="phone" className="input" placeholder="0771234567" inputMode="tel" required />
      </div>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton pendingText="Adding…">Add person</SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
      </div>
    </form>
  );
}
