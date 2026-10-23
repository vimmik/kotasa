"use client";

import { useActionState, useState } from "react";
import { recordSettlement } from "@/app/actions/money";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";
import { addDays, fmtDay } from "@/lib/time";
import { rs } from "@/lib/types";

type Props = {
  me: string;
  isAdmin: boolean;
  people: { id: string; name: string }[];
  owes: Record<string, number>;
  owed: Record<string, number>;
  initial: { direction: "paid" | "received"; other: string; amount: string };
  /** pairwise balances in the group, for the "between two others" hint */
  pairs?: { debtor: string; creditor: string; amount: number }[];
  today: string;
  /** Last closed date (YYYY-MM-DD): payments can't be dated on or before it. */
  closedThrough?: string | null;
};

type Direction = "paid" | "received" | "between";

/** A key for this form, so sending it twice (a double tap, a retry) saves the payment once. */
function newKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.floor(Math.random() * 256) & (15 >> (Number(c) / 4)))).toString(16),
  );
}

export function SettleForm({ me, isAdmin, people, owes, owed, initial, today, pairs = [], closedThrough = null }: Props) {
  const [state, action] = useActionState(recordSettlement, null);
  const [key] = useState(newKey);
  const [direction, setDirection] = useState<Direction>(initial.direction);
  const [other, setOther] = useState(initial.other);
  const [payer, setPayer] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState(initial.amount);
  const others = people.filter((p) => p.id !== me);
  const between = direction === "between";
  const owedBetween = pairs.find((x) => x.debtor === payer && x.creditor === payee)?.amount;
  const hint = between ? owedBetween : direction === "paid" ? owes[other] : owed[other];
  const from = between ? payer : direction === "paid" ? me : other;
  const to = between ? payee : direction === "paid" ? other : me;
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  // Paying someone the balances don't say you owe still counts, but it is often a mix-up.
  const expected = direction === "paid" ? Object.keys(owes) : Object.keys(owed);
  const offList = !between && !!other && !expected.includes(other);
  const minDate = closedThrough ? addDays(closedThrough, 1) : undefined;
  const modes: [Direction, string][] = [
    ["paid", "I paid someone"],
    ["received", "Someone paid me"],
    ...(isAdmin ? [["between", "Between others"] as [Direction, string]] : []),
  ];

  return (
    <ActionForm action={action} className="card space-y-4 p-5">
      <OrgField />
      <input type="hidden" name="client_key" value={key} />
      <input type="hidden" name="from_person" value={from} />
      <input type="hidden" name="to_person" value={to} />

      <div
        className={`grid gap-1 rounded-xl border border-line bg-surface-2 p-0.5 text-sm font-semibold ${modes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
      >
        {modes.map(([d, label]) => (
          <button
            key={d}
            type="button"
            aria-pressed={direction === d}
            onClick={() => setDirection(d)}
            className={`rounded-[10px] px-1 py-2 ${direction === d ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {between ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="payer">Who paid</label>
            <select id="payer" className="input" value={payer} onChange={(e) => setPayer(e.target.value)} required>
              <option value="" disabled>Choose a person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="payee">Paid to</label>
            <select id="payee" className="input" value={payee} onChange={(e) => setPayee(e.target.value)} required>
              <option value="" disabled>Choose a person</option>
              {people.filter((p) => p.id !== payer).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
      <div>
        <label className="label" htmlFor="other">{direction === "paid" ? "Paid to" : "Received from"}</label>
        <select id="other" className="input" value={other} onChange={(e) => setOther(e.target.value)} required>
          <option value="" disabled>Choose a person</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {direction === "paid" && owes[p.id] ? ` — you owe ${rs(owes[p.id])}` : ""}
              {direction === "received" && owed[p.id] ? ` — owes you ${rs(owed[p.id])}` : ""}
            </option>
          ))}
        </select>
      </div>
      )}

      {offList && (
        <p className="rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber-ink">
          {direction === "paid"
            ? `Kotasa doesn't show you owing ${name(other).split(" ")[0]} anything right now.`
            : `Kotasa doesn't show ${name(other).split(" ")[0]} owing you anything right now.`}{" "}
          {expected.length > 0
            ? `${direction === "paid" ? "You owe" : "Owed to you by"} ${expected.map((id) => name(id).split(" ")[0]).join(", ")}. You can still record it if the money really changed hands.`
            : "You can still record it if the money really changed hands."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="amount">Amount (Rs.)</label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            className="input text-lg font-semibold"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            required
          />
          {hint ? (
            <button type="button" className="mt-1 text-xs font-semibold text-brand" onClick={() => setAmount(String(hint))}>
              Use full balance · {rs(hint)}
            </button>
          ) : null}
        </div>
        <div>
          <label className="label" htmlFor="paid_on">Date</label>
          <input id="paid_on" name="paid_on" type="date" defaultValue={today} min={minDate} className="input" />
          {closedThrough && <p className="mt-1 text-xs text-muted">Closed up to {fmtDay(closedThrough)}</p>}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">Note (optional)</label>
        <input id="note" name="note" className="input" placeholder="Cash at the office" />
      </div>
      <FormMessage state={state} />
      {state?.confirm === "duplicate" && (
        <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm">
          <input type="checkbox" name="allow_duplicate" className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>Yes, this is another payment, not the same one again</span>
        </label>
      )}
      <SubmitButton className="btn-primary w-full" pendingText="Recording…">Record payment</SubmitButton>
    </ActionForm>
  );
}
