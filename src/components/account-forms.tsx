"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react/ssr";
import { leaveGroup, setMyPin } from "@/app/actions/auth";
import { ActionForm, ConfirmButton, FormMessage, SubmitButton } from "@/components/ui";
import { OrgField } from "@/components/org-field";

export function PinForm({ hasPin, needsPhone }: { hasPin: boolean; needsPhone: boolean }) {
  const [state, action] = useActionState(setMyPin, null);
  return (
    <ActionForm action={action} className="space-y-3" key={state?.ok ? "done" : "form"}>
      {needsPhone && (
        <div>
          <label className="label" htmlFor="pin-phone">Mobile number</label>
          <input id="pin-phone" name="phone" className="input" inputMode="tel" placeholder="0771234567" required />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pin">{hasPin ? "New PIN" : "Choose a PIN"}</label>
          <input id="pin" name="pin" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} className="input tracking-[0.4em]" required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm</label>
          <input id="confirm" name="confirm" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} className="input tracking-[0.4em]" required />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-ghost">{hasPin ? "Change PIN" : "Set PIN"}</SubmitButton>
    </ActionForm>
  );
}

export function CopyLink({ url, label = "Your bill link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={url} className="input font-mono text-xs" aria-label={label} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="btn-ghost shrink-0 px-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Leave this group. Asks first; balances and history stay with the group. */
export function LeaveGroupForm({ groupName }: { groupName: string }) {
  const [state, action] = useActionState(leaveGroup, null);
  return (
    <form action={action} className="space-y-2">
      <OrgField />
      <ConfirmButton
        className="btn-ghost w-full"
        pendingText="Leaving…"
        title={`Leave ${groupName}?`}
        message="Your history stays, and anything you owe is still owed."
        confirmText="Leave group"
        danger
      >
        Leave {groupName}
      </ConfirmButton>
      <FormMessage state={state} />
    </form>
  );
}
