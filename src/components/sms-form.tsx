"use client";

import { useActionState } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import { sendSmsNow, sendSmsTest } from "@/app/actions/admin";
import { ConfirmButton, FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";

export const SMS_FORM_ID = "sms-form";

export function SmsSendForm({ week, smsEnabled }: { week: string; smsEnabled: boolean }) {
  const [state, action] = useActionState(sendSmsNow, null);
  const boxes = () => document.querySelectorAll<HTMLInputElement>(`input[form="${SMS_FORM_ID}"][name="person_ids"]`);
  return (
    <form id={SMS_FORM_ID} action={action} className="card space-y-3">
      <OrgField />
      <input type="hidden" name="week" value={week} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => boxes().forEach((c) => (c.checked = true))}>Tick all</button>
        <button type="button" className="btn-ghost" onClick={() => boxes().forEach((c) => (c.checked = false))}>Clear</button>
        <ConfirmButton
          pendingText="Sending…"
          title="Send this week's SMS?"
          message={() => {
            const n = [...boxes()].filter((c) => c.checked).length;
            return `It goes to ${n} ${n === 1 ? "person" : "people"} right away, and the weekly SMS fee is added to their bills.`;
          }}
          confirmText="Send now"
        >
          <PaperPlaneTilt size={16} aria-hidden="true" /> Send to ticked
        </ConfirmButton>
      </div>
      {!smsEnabled && (
        <p className="rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber-ink">
          SMS is off — sends are logged as a dry run. Turn it on in Settings once the Text.lk key is set.
        </p>
      )}
      <FormMessage state={state} />
    </form>
  );
}

/** Sends one test SMS to the signed-in admin's own number, whether SMS is on or off. */
export function SmsTestForm({ phone }: { phone: string | null }) {
  const [state, action] = useActionState(sendSmsTest, null);
  return (
    <form action={action} className="card space-y-3">
      <OrgField />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Test SMS</h2>
          <p className="text-sm text-muted">
            {phone ? `Sends one SMS to your number (${phone}) to check the SMS setup.` : "Add your mobile number on the People page to send a test."}
          </p>
        </div>
        <SubmitButton className="btn-ghost" pendingText="Sending…" disabled={!phone}>
          <PaperPlaneTilt size={16} aria-hidden="true" /> Send test
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
