"use client";

import { useActionState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LockSimple, LockSimpleOpen } from "@phosphor-icons/react/ssr";
import { closeBooksNow, reopenBooks, saveAutoClose } from "@/app/actions/books";
import { ActionForm, ConfirmButton, FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";

/**
 * Picking a date reloads the page with ?through=, so the preview below it (`children`, rendered
 * on the server) always shows what this close would save and lock.
 */
export function CloseBooksForm({
  min,
  max,
  value,
  summary,
  children,
}: {
  min: string | null;
  max: string;
  value: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [state, action] = useActionState(closeBooksNow, null);
  const router = useRouter();
  const pathname = usePathname();
  const [loading, start] = useTransition();
  return (
    <ActionForm action={action} className="card space-y-3">
      <OrgField />
      <div>
        <h2 className="font-semibold">Close the books</h2>
        <p className="text-sm text-muted">Pick the last day to lock, usually the end of the week you just billed.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="closed_through">Close up to and including</label>
          <input
            id="closed_through"
            name="closed_through"
            type="date"
            defaultValue={value}
            min={min ?? undefined}
            max={max}
            className="input w-auto"
            required
            onChange={(e) => {
              const v = e.target.value;
              // Typing a date fires on every complete value (e.g. year 0002), so only real choices reload.
              if (v && v !== value && v <= max && (!min || v >= min)) start(() => router.replace(`${pathname}?through=${v}`, { scroll: false }));
            }}
          />
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="note">Note (optional)</label>
          <input id="note" name="note" maxLength={120} placeholder="October week 2" className="input" />
        </div>
      </div>
      <div className={`space-y-2 transition-opacity ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
        <p className="text-sm font-medium">{summary}</p>
        {children}
      </div>
      <ConfirmButton
        pendingText="Closing…"
        title="Close the books?"
        message={() => `${summary} The balances above are saved as they are. Only an owner can reopen it.`}
        confirmText="Close books"
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
