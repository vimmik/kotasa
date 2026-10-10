"use client";

import { useActionState, useState } from "react";
import { recordSettlement } from "@/app/actions/money";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";
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
};

type Direction = "paid" | "received" | "between";

export function SettleForm({ me, isAdmin, people, owes, owed, initial, today, pairs = [] }: Props) {
  const [state, action] = useActionState(recordSettlement, null);
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
  const modes: [Direction, string][] = [
    ["paid", "I paid someone"],
    ["received", "Someone paid me"],
    ...(isAdmin ? [["between", "Between others"] as [Direction, string]] : []),
  ];

  return (
    <ActionForm action={action} className="card space-y-4 p-5">
      <OrgField />
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
          <input id="paid_on" name="paid_on" type="date" defaultValue={today} className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">Note (optional)</label>
        <input id="note" name="note" className="input" placeholder="Cash at the office" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Recording…">Record payment</SubmitButton>
    </ActionForm>
  );
}
