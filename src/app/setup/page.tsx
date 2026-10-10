"use client";

import { useActionState } from "react";
import { setupFirstAdmin } from "@/app/actions/auth";
import { LogoMark } from "@/components/brand";
import { FormMessage, SubmitButton } from "@/components/ui";

export default function SetupPage() {
  const [state, action] = useActionState(setupFirstAdmin, null);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-8">
      <LogoMark size={48} />
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Set up your office</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Create the first admin. This works once; after that, admins add people from the panel. You can also
        sign in with Google first instead — the very first account becomes admin.
      </p>
      <form action={action} className="card space-y-3 p-5">
        <div>
          <label className="label" htmlFor="full_name">Your name</label>
          <input id="full_name" name="full_name" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="phone">Mobile number</label>
          <input id="phone" name="phone" className="input" inputMode="tel" placeholder="0771234567" required />
        </div>
        <div>
          <label className="label" htmlFor="pin">Choose a 6-digit PIN</label>
          <input id="pin" name="pin" className="input tracking-[0.5em]" inputMode="numeric" pattern="\d{6}" maxLength={6} type="password" required />
        </div>
        <FormMessage state={state} />
        <SubmitButton className="btn-primary w-full" pendingText="Creating…">Create admin</SubmitButton>
      </form>
    </main>
  );
}
