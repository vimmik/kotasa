"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Plus, UserPlus, X } from "@phosphor-icons/react/ssr";
import { addGuest, saveExpense } from "@/app/actions/expenses";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { ICONS } from "@/components/bits";
import { OrgField } from "@/components/org-field";
import { splitEqually } from "@/lib/split";
import { BRAND } from "@/lib/brand";
import { addDays, fmtDay } from "@/lib/time";
import { rs, round2, type Budget, type Category, type Copayer, type Expense, type MemberWithLogin } from "@/lib/types";

type Props = {
  me: string;
  people: MemberWithLogin[];
  budgets: Pick<Budget, "id" | "name">[];
  categories: Category[];
  today: string;
  canAddGuests: boolean;
  expense?: Expense;
  shares?: Record<string, number>;
  copayers?: Copayer[];
  defaultBudget?: string;
  /** Last closed date (YYYY-MM-DD): nothing can be dated on or before it. */
  closedThrough?: string | null;
};

/** Groups this size or smaller start a new expense split between everyone. */
const SPLIT_ALL_UP_TO = 8;

export function ExpenseForm({ me, people, budgets, categories, today, canAddGuests, expense, shares, copayers, defaultBudget, closedThrough = null }: Props) {
  const [state, action] = useActionState(saveExpense, null);
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [category, setCategory] = useState(expense?.category ?? categories[0]?.key ?? "other");
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? me);
  const [splitType, setSplitType] = useState<"equal" | "custom">(expense?.split_type ?? "equal");
  // A new expense in a small group is usually for everyone; in a big one (an office floor) it isn't,
  // so there you start with just yourself and tick the others.
  const [selected, setSelected] = useState<Set<string>>(
    new Set(shares ? Object.keys(shares) : people.length <= SPLIT_ALL_UP_TO ? people.map((p) => p.id) : [me]),
  );
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(shares ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [filter, setFilter] = useState("");
  const [others, setOthers] = useState<{ id: string; amount: string }[]>(
    (copayers ?? []).map((c) => ({ id: c.member_id, amount: String(c.amount) })),
  );

  const total = Number(amount) || 0;
  const ids = people.filter((p) => selected.has(p.id)).map((p) => p.id);
  const equal: Record<string, number> =
    ids.length && total > 0 ? Object.fromEntries(splitEqually(total, ids).map((s) => [s.person_id, s.amount])) : {};
  const customSum = round2(ids.reduce((s, id) => s + (Number(custom[id]) || 0), 0));
  const left = round2(total - customSum);
  const othersSum = round2(others.reduce((s, o) => s + (Number(o.amount) || 0), 0));
  const mainPaid = round2(total - othersSum);
  const nameOf = (id: string) => (id === me ? "You" : (people.find((p) => p.id === id)?.full_name ?? "?"));
  const addPayer = () => {
    const used = new Set([paidBy, ...others.map((o) => o.id)]);
    setOthers((o) => [...o, { id: people.find((p) => !used.has(p.id))?.id ?? "", amount: "" }]);
  };

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
      <ActionForm action={action} className="space-y-4">
        <OrgField />
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
                className="input text-lg font-semibold"
                placeholder="1200"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="expense_date">Date</label>
              <input
                id="expense_date"
                name="expense_date"
                type="date"
                defaultValue={expense?.expense_date ?? today}
                min={closedThrough ? addDays(closedThrough, 1) : undefined}
                className="input"
                required
              />
              {closedThrough && <p className="mt-1 text-xs text-muted">Closed up to {fmtDay(closedThrough)}</p>}
            </div>
          </div>
          <div>
            <span className="label">Category</span>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="label" htmlFor="paid_by">Paid by</label>
              <select id="paid_by" name="paid_by" className="input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === me ? `You (${p.full_name})` : p.full_name}
                  </option>
                ))}
              </select>
              {others.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    name="copayer_id"
                    aria-label={`Other payer ${i + 1}`}
                    className="input min-w-0 flex-1 py-1.5"
                    value={o.id}
                    onChange={(e) => setOthers((all) => all.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}
                  >
                    <option value="" disabled>Who else paid?</option>
                    {people
                      .filter((p) => p.id === o.id || (p.id !== paidBy && !others.some((x) => x.id === p.id)))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.id === me ? `You (${p.full_name})` : p.full_name}</option>
                      ))}
                  </select>
                  <input
                    name="copayer_amount"
                    inputMode="decimal"
                    aria-label={`How much ${nameOf(o.id)} paid`}
                    className="input w-28 py-1.5 text-right"
                    placeholder="Rs."
                    value={o.amount}
                    onChange={(e) =>
                      setOthers((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^\d.]/g, "") } : x)))
                    }
                  />
                  <button
                    type="button"
                    className="btn-ghost size-9 shrink-0 p-0"
                    aria-label={`Remove ${nameOf(o.id)} as a payer`}
                    onClick={() => setOthers((all) => all.filter((_, j) => j !== i))}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {others.length > 0 && total > 0 && (
                <p className={`text-xs font-semibold ${mainPaid > 0 ? "text-muted" : "text-danger"}`}>
                  {mainPaid > 0 ? `${nameOf(paidBy)} paid the rest: ${rs(mainPaid)}` : "The other payers add up to the whole bill or more"}
                </p>
              )}
              {others.length < people.length - 1 && (
                <button type="button" className="flex items-center gap-1 text-xs font-semibold text-brand" onClick={addPayer}>
                  <Plus size={13} aria-hidden="true" /> {others.length ? "Add another payer" : "Someone else paid part of it"}
                </button>
              )}
            </div>
            <div className={budgets.length ? "" : "hidden"}>
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
            <h2 className="font-semibold">Split between {ids.length ? `${ids.length} ${ids.length === 1 ? "person" : "people"}` : ""}</h2>
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
      </ActionForm>

      {canAddGuests && <AddGuest onAdded={(id) => setSelected((s) => new Set(s).add(id))} />}
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
    <ActionForm action={action} className="card space-y-3" key={state?.personId}>
      <OrgField />
      <div>
        <h3 className="font-semibold">Add a person</h3>
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
    </ActionForm>
  );
}
