"use client";

import { useActionState, useState } from "react";
import { Minus, Plus, X } from "@phosphor-icons/react/ssr";
import { addSharedMealItem, setMealMode, setMealPayer } from "@/app/actions/meals";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";
import { rs, type Copayer } from "@/lib/types";

/**
 * "Who paid the vendor for this meal today". Blank = the group's collector. Others can have
 * paid part of the bill; the main payer then owes them that part.
 */
export function MealPayerForm({
  date,
  meal,
  label,
  payerId,
  collectorId,
  collectorName,
  people,
  copayers = [],
  total,
}: {
  date: string;
  meal: string;
  label: string;
  payerId: string | null;
  collectorId: string | null;
  collectorName: string | null;
  people: { id: string; full_name: string }[];
  copayers?: Copayer[];
  /** this meal's bill so far (orders + shared items) */
  total: number;
}) {
  const [state, action] = useActionState(setMealPayer, null);
  const [main, setMain] = useState(payerId ?? "");
  const [others, setOthers] = useState(copayers.map((c) => ({ id: c.member_id, amount: String(c.amount) })));
  const id = `payer-${meal}`;
  const mainId = main || collectorId;
  const mainName = people.find((p) => p.id === mainId)?.full_name ?? collectorName ?? "The payer";
  const rest = Math.round((total - others.reduce((s, o) => s + (Number(o.amount) || 0), 0)) * 100) / 100;
  const free = (keep: string) => people.filter((p) => p.id === keep || (p.id !== mainId && !others.some((o) => o.id === p.id)));
  return (
    <ActionForm action={action} className="mt-3 space-y-2 print:hidden">
      <OrgField />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
      <label className="label" htmlFor={id}>{label} paid by</label>
      <select id={id} name="member_id" value={main} onChange={(e) => setMain(e.target.value)} className="input w-full py-1.5">
        <option value="">{collectorName ? `${collectorName} (collector)` : "The collector"}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.full_name}</option>
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
            {free(o.id).map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
          <input
            name="copayer_amount"
            inputMode="decimal"
            aria-label="How much they paid"
            className="input w-24 py-1.5 text-right"
            placeholder="Rs."
            value={o.amount}
            onChange={(e) => setOthers((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^\d.]/g, "") } : x)))}
          />
          <button
            type="button"
            className="btn-ghost size-9 shrink-0 p-0"
            aria-label="Remove this payer"
            onClick={() => setOthers((all) => all.filter((_, j) => j !== i))}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
      {others.length > 0 && total > 0 && (
        <p className={`text-xs font-semibold ${rest > 0 ? "text-muted" : "text-danger"}`}>
          {rest > 0 ? `${mainName} paid the rest: ${rs(rest)}` : `The others paid more than the ${rs(total)} bill`}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-semibold text-brand"
          onClick={() => setOthers((o) => [...o, { id: free("")[0]?.id ?? "", amount: "" }])}
        >
          <Plus size={13} aria-hidden="true" /> {others.length ? "Add another payer" : "Someone else paid part of it"}
        </button>
        <SubmitButton className="btn-ghost px-3" pendingText="…">Save</SubmitButton>
      </div>
      {state?.error && <FormMessage state={state} />}
    </ActionForm>
  );
}

/** Switch this meal, on this day only, between "everyone orders" and "shared bill". */
export function MealModeForm({ date, meal, pooled }: { date: string; meal: string; pooled: boolean }) {
  const [state, action, pending] = useActionState(setMealMode, null);
  return (
    <form action={action} className="mt-2 print:hidden">
      <OrgField />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
      <div className="inline-grid grid-cols-2 gap-0.5 rounded-xl border border-line bg-surface-2 p-0.5 text-xs font-semibold" aria-busy={pending}>
        {[
          { v: "0", label: "Everyone orders", on: !pooled },
          { v: "1", label: "Shared bill", on: pooled },
        ].map((o) => (
          <button
            key={o.v}
            name="pooled"
            value={o.v}
            aria-pressed={o.on}
            disabled={pending}
            className={`rounded-[10px] px-3 py-1.5 ${o.on ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}

/**
 * Add something bought for this meal, split equally.
 * Ordered meals: a family pack, drinks, delivery, shared by the people ticked.
 * Shared-bill meals: the bill itself (pick from the menu), always split among everyone eating.
 */
export function SharedItemForm({
  date,
  meal,
  label,
  people,
  eaters,
  pooled = false,
  menu = [],
}: {
  date: string;
  meal: string;
  label: string;
  people: { id: string; full_name: string }[];
  /** ticked by default: people who ordered this meal, or for a shared bill everyone who joined */
  eaters: string[];
  pooled?: boolean;
  /** that day's menu for this meal, to fill in what was bought */
  menu?: { name: string; price: number }[];
}) {
  const [state, action] = useActionState(addSharedMealItem, null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set(eaters));
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const count = pooled ? eaters.length : picked.size;
  const each = count && Number(amount) > 0 ? Number(amount) / count : 0;
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // Picking portions from the menu writes the title and total; both stay editable.
  const bump = (name: string, by: number) => {
    const next = { ...qty, [name]: Math.max(0, (qty[name] ?? 0) + by) };
    setQty(next);
    const lines = menu.filter((m) => next[m.name]);
    setTitle(lines.map((m) => `${m.name} ×${next[m.name]}`).join(" + "));
    setAmount(lines.length ? String(Math.round(lines.reduce((s, m) => s + m.price * next[m.name], 0) * 100) / 100) : "");
  };

  if (!open) {
    return (
      <button type="button" className={`${pooled ? "btn-primary" : "btn-ghost"} mt-3 w-full print:hidden`} onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden="true" /> {pooled ? "Add the bill" : "Add a shared item"}
      </button>
    );
  }
  return (
    <ActionForm action={action} className="mt-3 space-y-3 rounded-xl border border-line bg-surface-2 p-3 print:hidden">
      <OrgField />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
      <p className="text-sm font-semibold">{pooled ? `${label} bill` : `Shared ${label.toLowerCase()} item`}</p>
      {menu.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">What was bought</p>
          {menu.map((m) => (
            <div key={m.name} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {m.name} <span className="text-muted">· {rs(m.price)}</span>
              </span>
              <button type="button" className="btn-ghost size-8 p-0" onClick={() => bump(m.name, -1)} aria-label={`One less ${m.name}`} disabled={!qty[m.name]}>
                <Minus size={14} aria-hidden="true" />
              </button>
              <span className="w-6 text-center font-semibold tabular-nums">{qty[m.name] ?? 0}</span>
              <button type="button" className="btn-ghost size-8 p-0" onClick={() => bump(m.name, 1)} aria-label={`One more ${m.name}`}>
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          name="title"
          className="input min-w-0 flex-1"
          placeholder={pooled ? "Egg noodles ×3 + Rice & curry ×3" : "Family pack + 2 Coke"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          aria-label="What was it"
        />
        <input
          name="amount"
          className="input w-28"
          inputMode="decimal"
          placeholder="Rs."
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          required
          aria-label="Total amount"
        />
      </div>
      {pooled ? (
        <p className="text-xs text-muted">
          Split among the {count} {count === 1 ? "person" : "people"} eating{each ? ` · ${rs(Math.round(each * 100) / 100)} each` : ""}. If
          someone joins or leaves later, it re-splits.
        </p>
      ) : (
        <fieldset>
          <legend className="label">Shared by {picked.size} {each ? `· ${rs(Math.round(each * 100) / 100)} each` : ""}</legend>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <label
                key={p.id}
                className={`pill cursor-pointer py-1 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${picked.has(p.id) ? "bg-brand-soft text-brand-strong" : "bg-surface text-muted"}`}
              >
                <input
                  type="checkbox"
                  name="participants"
                  value={p.id}
                  checked={picked.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="sr-only"
                />
                {p.full_name.split(" ")[0]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton pendingText="Adding…">Add and split</SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </ActionForm>
  );
}
