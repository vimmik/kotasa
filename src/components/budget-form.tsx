"use client";

import { useActionState } from "react";
import { saveBudget } from "@/app/actions/money";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";
import type { Budget } from "@/lib/types";

export function BudgetForm({ budget }: { budget?: Budget }) {
  const [state, action] = useActionState(saveBudget, null);
  return (
    <ActionForm action={action} className="card space-y-3">
      <OrgField />
      <h2 className="font-semibold">{budget ? "Edit budget" : "New budget"}</h2>
      {budget && <input type="hidden" name="id" value={budget.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" defaultValue={budget?.name} className="input" placeholder="Team outing — Ella" required />
        </div>
        <div>
          <label className="label" htmlFor="limit_amount">Limit (Rs., optional)</label>
          <input id="limit_amount" name="limit_amount" defaultValue={budget?.limit_amount ?? ""} inputMode="decimal" className="input" placeholder="20000" />
        </div>
        <div>
          <label className="label" htmlFor="starts_on">From (optional)</label>
          <input id="starts_on" name="starts_on" type="date" defaultValue={budget?.starts_on ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="ends_on">To (optional)</label>
          <input id="ends_on" name="ends_on" type="date" defaultValue={budget?.ends_on ?? ""} className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="description">Description (optional)</label>
        <input id="description" name="description" defaultValue={budget?.description ?? ""} className="input" placeholder="Transport, food and tickets" />
      </div>
      {budget && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="closed" defaultChecked={budget.closed} className="size-4 accent-[var(--brand)]" /> Closed (no new expenses)
        </label>
      )}
      <FormMessage state={state} />
      <SubmitButton>{budget ? "Save budget" : "Create budget"}</SubmitButton>
    </ActionForm>
  );
}
