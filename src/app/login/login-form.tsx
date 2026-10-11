"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginWithPin } from "@/app/actions/auth";
import { GoogleButton } from "@/components/google-button";
import { ActionForm, FormMessage, PillSubmit } from "@/components/ui";

const ERRORS: Record<string, string> = {
  google: "Google sign-in didn't complete. Try again.",
  inactive: "Your account is inactive. Contact your admin.",
  "google-in-use": "That Google account is already used by another Kotasa account. Log in with it, or connect a different Google account.",
  "google-link": "Couldn't connect that Google account. Log in with your number and PIN and try again.",
};

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action] = useActionState(loginWithPin, null);
  const params = useSearchParams();
  const err = params.get("error");
  const next = params.get("next") ?? "/me";

  return (
    <div className="space-y-4">
      {err && ERRORS[err] && <FormMessage state={{ error: ERRORS[err] }} />}

      {googleEnabled && (
        <>
          <GoogleButton next={next} />
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or use your mobile number <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <ActionForm action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="phone">Mobile number</label>
          <input id="phone" name="phone" className="input min-h-12 rounded-2xl" inputMode="tel" placeholder="0771234567" required autoComplete="tel" pattern="[\d+\(\)\s\-]{9,20}" maxLength={20} title="Enter a valid mobile number, e.g. 0771234567" />
        </div>
        <div>
          <label className="label" htmlFor="pin">6-digit PIN</label>
          <input id="pin" name="pin" className="input min-h-12 rounded-2xl tracking-[0.5em]" inputMode="numeric" pattern="\d{6}" maxLength={6} type="password" required autoComplete="current-password" />
        </div>
        <FormMessage state={state} />
        <PillSubmit pendingText="Logging in…">Log in</PillSubmit>
      </ActionForm>
    </div>
  );
}
