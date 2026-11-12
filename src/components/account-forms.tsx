"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react/ssr";
import { leaveGroup, savePayDetails, setMyPin } from "@/app/actions/auth";
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

/**
 * Bank details people who owe you see (and get in their SMS). On a group's Account page there is a
 * second field for a different account in just that group.
 */
export function PayDetailsForm({ general, group }: { general: string | null; group?: { name: string; own: string | null } }) {
  const [state, action] = useActionState(savePayDetails, null);
  const [different, setDifferent] = useState(!!group?.own);
  return (
    <ActionForm action={action} className="space-y-3">
      {group && <OrgField />}
      <div>
        <label className="label" htmlFor="pay_details">Bank details{group ? " (all your groups)" : ""}</label>
        <input
          id="pay_details"
          name="pay_details"
          defaultValue={general ?? ""}
          maxLength={120}
          className="input"
          placeholder="BOC 8012345678, K Dinajara, Colombo"
        />
      </div>
      {group && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={different} onChange={(e) => setDifferent(e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Use a different account in {group.name}
          </label>
          {different ? (
            <div>
              <label className="label" htmlFor="member_pay_details">Bank details for {group.name}</label>
              <input
                id="member_pay_details"
                name="member_pay_details"
                defaultValue={group.own ?? ""}
                maxLength={120}
                className="input"
                placeholder="HNB 0123456789, K Dinajara"
              />
            </div>
          ) : (
            <input type="hidden" name="member_pay_details" value="" />
          )}
        </>
      )}
      <p className="text-xs text-muted">
        Shown only to people who owe you money: on their Home, bill link and payment page, and in their SMS.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Save bank details</SubmitButton>
        <FormMessage state={state} />
      </div>
    </ActionForm>
  );
}
