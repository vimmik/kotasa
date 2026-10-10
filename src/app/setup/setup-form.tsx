"use client";

import { useActionState } from "react";
import { setupFirstAccount } from "@/app/actions/auth";
import { ActionForm, FormMessage, PillSubmit } from "@/components/ui";

export function SetupForm() {
  const [state, action] = useActionState(setupFirstAccount, null);
  return (
    <ActionForm action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="full_name">Your name</label>
        <input id="full_name" name="full_name" className="input min-h-12 rounded-2xl" required autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="phone">Mobile number</label>
        <input id="phone" name="phone" className="input min-h-12 rounded-2xl" inputMode="tel" placeholder="0771234567" required autoComplete="tel" />
      </div>
      <div>
        <label className="label" htmlFor="group_name">Group name</label>
        <input id="group_name" name="group_name" className="input min-h-12 rounded-2xl" placeholder="Colombo office" autoComplete="off" required />
      </div>
      <div>
        <label className="label" htmlFor="pin">Choose a 6-digit PIN</label>
        <input id="pin" name="pin" className="input min-h-12 rounded-2xl tracking-[0.5em]" inputMode="numeric" pattern="\d{6}" maxLength={6} type="password" required autoComplete="new-password" />
      </div>
      <FormMessage state={state} />
      <PillSubmit pendingText="Creating…">Create account</PillSubmit>
    </ActionForm>
  );
}
