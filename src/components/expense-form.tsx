"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Minus, Plus, UserPlus, X } from "@phosphor-icons/react/ssr";
import { addGuest, saveExpense } from "@/app/actions/expenses";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { ICONS } from "@/components/bits";
import { OrgField } from "@/components/org-field";
import { billTotals, splitByItems, splitEqually, type Bill } from "@/lib/split";
import type { ScannedBill } from "@/lib/receipt";
import { BillScan } from "@/components/bill-scan";
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
  /** Show "Scan a bill" (an Anthropic API key is set) */
  scanEnabled?: boolean;
};

type SplitMode = "equal" | "items" | "custom";
type ItemRow = { key: number; name: string; amount: string; people: string[] };
type ExtraRow = { key: number; label: string; amount: string; kind: "charge" | "discount" };
let nextKey = 1;
const num = (v: string) => v.replace(/[^\d.]/g, "");

/** Groups this size or smaller start a new expense split between everyone. */
const SPLIT_ALL_UP_TO = 8;

export function ExpenseForm({ me, people, budgets, categories, today, canAddGuests, expense, shares, copayers, defaultBudget, closedThrough = null, scanEnabled = false }: Props) {
  const [state, action] = useActionState(saveExpense, null);
  const [title, setTitle] = useState(expense?.title ?? "");
  const [date, setDate] = useState(expense?.expense_date ?? today);
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [category, setCategory] = useState(expense?.category ?? categories[0]?.key ?? "other");
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? me);
  const [splitType, setSplitType] = useState<SplitMode>(expense?.bill ? "items" : (expense?.split_type ?? "equal"));
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
  const [items, setItems] = useState<ItemRow[]>(() =>
    expense?.bill?.items.length
      ? expense.bill.items.map((i) => ({ key: nextKey++, name: i.name, amount: String(i.amount), people: i.people }))
      : [{ key: nextKey++, name: "", amount: "", people: [] }],
  );
  const [extras, setExtras] = useState<ExtraRow[]>(() =>
    (expense?.bill?.extras ?? []).map((x) => ({ key: nextKey++, label: x.label, amount: String(x.amount), kind: x.kind })),
  );
  const [scanNote, setScanNote] = useState<string | null>(null);

  const ids = people.filter((p) => selected.has(p.id)).map((p) => p.id);
  // By item: who had each line, among the people ticked below (an item with nobody yet goes to everyone ticked).
  const bill: Bill = {
    items: items
      .filter((i) => Number(i.amount) > 0 || i.name.trim())
      .map((i) => ({
        name: i.name.trim(),
        amount: Number(i.amount) || 0,
        people: ids.filter((id) => i.people.includes(id)),
      })),
    extras: extras.filter((x) => Number(x.amount) > 0).map((x) => ({ label: x.label.trim(), amount: Number(x.amount), kind: x.kind })),
  };
  const sums = billTotals(bill);
  const byItem = splitType === "items" ? new Map(splitByItems(bill).map((s) => [s.person_id, s])) : new Map();
  const total = splitType === "items" ? Math.max(sums.total, 0) : Number(amount) || 0;
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

  const setItem = (key: number, patch: Partial<ItemRow>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const setExtra = (key: number, patch: Partial<ExtraRow>) => setExtras((all) => all.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const addExtra = (kind: ExtraRow["kind"]) =>
    setExtras((all) => [...all, { key: nextKey++, label: kind === "discount" ? "Discount" : "Tax", amount: "", kind }]);
  const togglePerson = (key: number, id: string) =>
    setItems((all) =>
      all.map((i) => (i.key !== key ? i : { ...i, people: i.people.includes(id) ? i.people.filter((x) => x !== id) : [...i.people, id] })),
    );

  /** Fill the form from a scanned bill: every item starts with everyone ticked below. */
  const applyScan = (b: ScannedBill) => {
    if (!title.trim() && b.merchant) setTitle(b.merchant.slice(0, 80));
    if (b.date && b.date <= today && (!closedThrough || b.date > closedThrough)) setDate(b.date);
    setSplitType("items");
    setItems(b.items.map((i) => ({ key: nextKey++, name: i.name, amount: String(i.amount), people: ids })));
    setExtras([
      ...b.charges.map((c) => ({ key: nextKey++, label: c.label, amount: String(c.amount), kind: "charge" as const })),
      ...b.discounts.map((c) => ({ key: nextKey++, label: c.label, amount: String(c.amount), kind: "discount" as const })),
    ]);
    const read = billTotals({
      items: b.items.map((i) => ({ ...i, people: [] })),
      extras: [...b.charges.map((c) => ({ ...c, kind: "charge" as const })), ...b.discounts.map((c) => ({ ...c, kind: "discount" as const }))],
    }).total;
    setScanNote(
      b.printedTotal && Math.abs(b.printedTotal - read) > 0.01
        ? `The bill says ${rs(b.printedTotal)} but the lines read add up to ${rs(read)}. Check the items and charges.`
        : `Read ${b.items.length} ${b.items.length === 1 ? "item" : "items"}. Untick people from what they didn't have.`,
    );
  };

  return (
    <div className="space-y-4">
      <ActionForm action={action} className="space-y-4">
        <OrgField />
        {expense && <input type="hidden" name="id" value={expense.id} />}
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="split_type" value={splitType} />
        {splitType === "items" ? (
          <input type="hidden" name="bill" value={JSON.stringify(bill)} />
        ) : (
          ids.map((id) => <input key={id} type="hidden" name="participants" value={id} />)
        )}

        {scanEnabled && <BillScan onScanned={applyScan} />}

        <section className="card space-y-4">
          <div>
            <label className="label" htmlFor="title">What was it for?</label>
            <input
              id="title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="Uber to the client meeting"
              required
              maxLength={80}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="amount">Amount (Rs.)</label>
              {splitType === "items" ? (
                <>
                  <input id="amount" className="input text-lg font-semibold" value={total ? String(total) : ""} placeholder="From the items" readOnly />
                  <p className="mt-1 text-xs text-muted">Adds up from the items below</p>
                </>
              ) : (
                <input
                  id="amount"
                  name="amount"
                  inputMode="decimal"
                  className="input text-lg font-semibold"
                  placeholder="1200"
                  value={amount}
                  onChange={(e) => setAmount(num(e.target.value))}
                  required
                />
              )}
            </div>
            <div>
              <label className="label" htmlFor="expense_date">Date</label>
              <input
                id="expense_date"
                name="expense_date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
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
              {(["equal", "items", "custom"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    // Switching to "By item" with nothing entered yet: start with the amount as one line.
                    if (t === "items" && splitType !== "items" && !bill.items.length && Number(amount) > 0)
                      setItems([{ key: nextKey++, name: title.trim() || "Bill", amount, people: ids }]);
                    setSplitType(t);
                  }}
                  aria-pressed={splitType === t}
                  className={`rounded-[10px] px-3 py-1.5 ${splitType === t ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted"}`}
                >
                  {t === "equal" ? "Equally" : t === "items" ? "By item" : "Custom"}
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
                    (splitType === "items" ? (
                      <span className="text-right text-sm tabular-nums">
                        {byItem.has(p.id) ? (
                          <>
                            <b>{rs(byItem.get(p.id)!.amount)}</b>
                            {Math.abs(byItem.get(p.id)!.amount - byItem.get(p.id)!.items) > 0.004 && (
                              <span className="block text-[11px] text-muted">items {rs(byItem.get(p.id)!.items)}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">nothing</span>
                        )}
                      </span>
                    ) : splitType === "equal" ? (
                      <span className="text-sm text-muted tabular-nums">{equal[p.id] !== undefined ? rs(equal[p.id]) : ""}</span>
                    ) : (
                      <input
                        name={`share_${p.id}`}
                        inputMode="decimal"
                        aria-label={`${p.full_name}'s share`}
                        className="input w-28 py-1.5 text-right"
                        placeholder="0"
                        value={custom[p.id] ?? ""}
                        onChange={(e) => setCustom((c) => ({ ...c, [p.id]: num(e.target.value) }))}
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
          {splitType === "items" && (
            <p className="text-xs text-muted">
              Each item is split between the people who had it. Tax, charges and discounts are shared in proportion to what each person had.
            </p>
          )}
        </section>

        {splitType === "items" && (
          <section className="card space-y-3">
            <h2 className="font-semibold">Items on the bill</h2>
            {scanNote && <p className="rounded-xl bg-info-soft px-3 py-2 text-sm text-info-ink">{scanNote}</p>}
            {!ids.length && <p className="text-sm text-danger">Tick the people who were there above first.</p>}
            <ul className="space-y-3">
              {items.map((it, n) => {
                const who = ids.filter((id) => it.people.includes(id));
                return (
                  <li key={it.key} className="space-y-2 rounded-xl border border-line p-3">
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={`Item ${n + 1}`}
                        className="input min-w-0 flex-1 py-1.5"
                        placeholder="Nasi kottu"
                        maxLength={60}
                        value={it.name}
                        onChange={(e) => setItem(it.key, { name: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn-ghost size-9 shrink-0 p-0"
                        aria-label={`Remove item ${n + 1}`}
                        onClick={() => setItems((all) => all.filter((x) => x.key !== it.key))}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        aria-label={`Price of item ${n + 1}`}
                        inputMode="decimal"
                        className="input w-32 py-1.5 text-right"
                        placeholder="Price (Rs.)"
                        value={it.amount}
                        onChange={(e) => setItem(it.key, { amount: num(e.target.value) })}
                      />
                      {Number(it.amount) > 0 && who.length > 1 && (
                        <span className="text-xs text-muted tabular-nums">
                          {rs(Number(it.amount) / who.length)} each · {who.length} people
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted">Who had it:</span>
                      {ids.map((id) => {
                        const on = it.people.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => togglePerson(it.key, id)}
                            className={`rounded-lg border px-2 py-1 text-xs font-semibold ${on ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-muted"}`}
                          >
                            {nameOf(id).split(" ")[0]}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand"
                        onClick={() => setItem(it.key, { people: who.length === ids.length ? [] : ids })}
                      >
                        {who.length === ids.length ? "Nobody" : "Everyone"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-semibold text-brand"
              onClick={() => setItems((all) => [...all, { key: nextKey++, name: "", amount: "", people: ids }])}
            >
              <Plus size={14} aria-hidden="true" /> Add item
            </button>

            {extras.length > 0 && (
              <ul className="space-y-2 border-t border-line pt-3">
                {extras.map((x) => (
                  <li key={x.key} className="flex items-center gap-2">
                    <span
                      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg ${x.kind === "discount" ? "bg-brand-soft text-brand-strong" : "bg-amber-soft text-amber-ink"}`}
                      title={x.kind === "discount" ? "Taken off" : "Added"}
                    >
                      {x.kind === "discount" ? <Minus size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
                    </span>
                    <input
                      aria-label={x.kind === "discount" ? "Discount name" : "Charge name"}
                      className="input min-w-0 flex-1 py-1.5"
                      maxLength={40}
                      value={x.label}
                      onChange={(e) => setExtra(x.key, { label: e.target.value })}
                    />
                    <input
                      aria-label={`${x.label || "Charge"} amount`}
                      inputMode="decimal"
                      className="input w-28 py-1.5 text-right"
                      placeholder="Rs."
                      value={x.amount}
                      onChange={(e) => setExtra(x.key, { amount: num(e.target.value) })}
                    />
                    <button
                      type="button"
                      className="btn-ghost size-9 shrink-0 p-0"
                      aria-label={`Remove ${x.label || "line"}`}
                      onClick={() => setExtras((all) => all.filter((y) => y.key !== x.key))}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <button type="button" className="flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => addExtra("charge")}>
                <Plus size={14} aria-hidden="true" /> Tax or charge
              </button>
              <button type="button" className="flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => addExtra("discount")}>
                <Minus size={14} aria-hidden="true" /> Discount
              </button>
            </div>

            <dl className="space-y-1 rounded-xl bg-surface-2 px-3 py-2 text-sm tabular-nums">
              <div className="flex justify-between"><dt className="text-muted">Items</dt><dd>{rs(sums.items)}</dd></div>
              {sums.charges > 0 && <div className="flex justify-between"><dt className="text-muted">Tax and charges</dt><dd>+ {rs(sums.charges)}</dd></div>}
              {sums.discounts > 0 && <div className="flex justify-between"><dt className="text-muted">Discounts</dt><dd className="text-brand">− {rs(sums.discounts)}</dd></div>}
              <div className="flex justify-between font-semibold"><dt>Total</dt><dd className={sums.total < 0 ? "text-danger" : ""}>{rs(sums.total)}</dd></div>
            </dl>
            {bill.items.some((i) => !i.people.length) && (
              <p className="text-sm font-semibold text-danger">Pick who had each item.</p>
            )}
          </section>
        )}

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
