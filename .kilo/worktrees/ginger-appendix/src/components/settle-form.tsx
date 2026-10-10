"use client";

import { useActionState, useState } from "react";
import { recordSettlement } from "@/app/actions/money";
import { FormMessage, SubmitButton } from "@/components/ui";
import { rs } from "@/lib/types";

type Props = {
  me: string;
  isAdmin: boolean;
  people: { id: string; name: string }[];
  owes: Record<string, number>;
  owed: Record<string, number>;
  initial: { direction: "paid" | "received"; other: string; amount: string };
  today: string;
};

export function SettleForm({ me, people, owes, owed, initial, today }: Props) {
  const [state, action] = useActionState(recordSettlement, null);
  const [direction, setDirection] = useState(initial.direction);
  const [other, setOther] = useState(initial.other);
  const [amount, setAmount] = useState(initial.amount);
  const others = people.filter((p) => p.id !== me);
  const hint = direction === "paid" ? owes[other] : owed[other];

  return (
    <form action={action} className="card space-y-4 p-5">
      <input type="hidden" name="from_person" value={direction === "paid" ? me : other} />
      <input type="hidden" name="to_person" value={direction === "paid" ? other : me} />

      <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-0.5 text-sm font-semibold">
        {(["paid", "received"] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={direction === d}
            onClick={() => setDirection(d)}
            className={`rounded-[10px] py-2 ${direction === d ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted"}`}
          >
            {d === "paid" ? "I paid someone" : "Someone paid me"}
          </button>
        ))}
      </div>

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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="amount">Amount (Rs.)</label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            className="input text-lg font-bold"
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
    </form>
  );
}
