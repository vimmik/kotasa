"use client";

import { useActionState } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import { sendSmsNow } from "@/app/actions/admin";
import { FormMessage, SubmitButton } from "@/components/ui";

export const SMS_FORM_ID = "sms-form";

export function SmsSendForm({ week, smsEnabled }: { week: string; smsEnabled: boolean }) {
  const [state, action] = useActionState(sendSmsNow, null);
  const boxes = () => document.querySelectorAll<HTMLInputElement>(`input[form="${SMS_FORM_ID}"][name="person_ids"]`);
  return (
    <form id={SMS_FORM_ID} action={action} className="card space-y-3">
      <input type="hidden" name="week" value={week} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => boxes().forEach((c) => (c.checked = true))}>Tick all</button>
        <button type="button" className="btn-ghost" onClick={() => boxes().forEach((c) => (c.checked = false))}>Clear</button>
        <SubmitButton
          pendingText="Sending…"
          onClick={(e) => {
            const n = [...boxes()].filter((c) => c.checked).length;
            if (!confirm(`Send this week's SMS to ${n} ${n === 1 ? "person" : "people"} now?`)) e.preventDefault();
          }}
        >
          <PaperPlaneTilt size={16} aria-hidden="true" /> Send to ticked
        </SubmitButton>
      </div>
      {!smsEnabled && (
        <p className="rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber-ink">
          SMS is off — sends are logged as a dry run. Turn it on in Settings when your Notify.lk keys are in.
        </p>
      )}
      <FormMessage state={state} />
    </form>
  );
}
