"use client";

import { useActionState } from "react";
import { LockSimple, LockSimpleOpen } from "@phosphor-icons/react/ssr";
import { closeBooksNow, reopenBooks, saveAutoClose } from "@/app/actions/books";
import { ActionForm, ConfirmButton, FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";

export function CloseBooksForm({ today, min, defaultDate }: { today: string; min: string | null; defaultDate: string }) {
  const [state, action] = useActionState(closeBooksNow, null);
  return (
    <ActionForm action={action} className="card space-y-3">
      <OrgField />
      <div>
        <h2 className="font-semibold">Close the books</h2>
        <p className="text-sm text-muted">
          Everyone&apos;s balance up to this date is frozen as it is now. Payments after it pay off those amounts, and
          nothing on or before it can be added, edited or deleted.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="closed_through">Close up to and including</label>
          <input
            id="closed_through"
            name="closed_through"
            type="date"
            defaultValue={defaultDate}
            min={min ?? undefined}
            max={today}
            className="input w-auto"
            required
          />
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="note">Note (optional)</label>
          <input id="note" name="note" maxLength={120} placeholder="October week 2" className="input" />
        </div>
      </div>
      <ConfirmButton
        pendingText="Closing…"
        title="Close the books?"
        message="Balances up to that date stop changing, and those days are locked. Only an owner can reopen them."
        confirmText="Close"
      >
        <LockSimple size={16} aria-hidden="true" /> Close books
      </ConfirmButton>
      <FormMessage state={state} />
    </ActionForm>
  );
}

export function ReopenForm({ id, label }: { id: string; label: string }) {
  const [state, action] = useActionState(reopenBooks, null);
  return (
    <ActionForm action={action} className="space-y-2">
      <OrgField />
      <input type="hidden" name="id" value={id} />
      <ConfirmButton
        className="btn-ghost"
        pendingText="Reopening…"
        title={`Reopen ${label}?`}
        message="Those balances are worked out again from the full history, so they can change. People may have been told the old amounts already."
        confirmText="Reopen"
        danger
      >
        <LockSimpleOpen size={16} aria-hidden="true" /> Reopen
      </ConfirmButton>
      <FormMessage state={state} />
    </ActionForm>
  );
}

export function AutoCloseForm({ on }: { on: boolean }) {
  const [state, action] = useActionState(saveAutoClose, null);
  return (
    <ActionForm action={action} className="card space-y-3">
      <OrgField />
      <label className="flex items-start gap-3">
        <input type="checkbox" name="auto_close" defaultChecked={on} className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span>
          <span className="block text-sm font-semibold">Close every week by itself</span>
          <span className="text-xs text-muted">
            On the billing day, at the SMS hour, the books close up to the day before. Works even with SMS off.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-ghost">Save</SubmitButton>
        <FormMessage state={state} />
      </div>
    </ActionForm>
  );
}
