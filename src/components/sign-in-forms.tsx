"use client";

import { useActionState } from "react";
import { connectPhoneAccount } from "@/app/actions/auth";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui";

/**
 * "I already use Kotasa with my mobile number": the number and its PIN fold this (new, Google)
 * account into that one. `back` says where to land afterwards.
 */
export function ConnectPhoneForm({ back }: { back: "settings" | "me" }) {
  const [state, action] = useActionState(connectPhoneAccount, null);
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="back" value={back} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="connect-phone">Mobile number</label>
          <input id="connect-phone" name="phone" className="input" inputMode="tel" placeholder="0771234567" autoComplete="tel" required />
        </div>
        <div>
          <label className="label" htmlFor="connect-pin">Its 6-digit PIN</label>
          <input
            id="connect-pin"
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            className="input tracking-[0.4em]"
            autoComplete="current-password"
            required
          />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-ghost" pendingText="Connecting…">
        Connect my account
      </SubmitButton>
    </ActionForm>
  );
}
