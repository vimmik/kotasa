"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginWithGoogle, loginWithPin } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/ui";

const ERRORS: Record<string, string> = {
  google: "Google sign-in didn't complete. Try again.",
  inactive: "Your account is inactive. Contact your admin.",
};

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action] = useActionState(loginWithPin, null);
  const err = useSearchParams().get("error");

  return (
    <div className="space-y-4">
      {err && ERRORS[err] && <FormMessage state={{ error: ERRORS[err] }} />}

      {googleEnabled && (
        <>
          <form action={loginWithGoogle}>
            <SubmitButton className="btn-ghost w-full" pendingText="Opening Google…">
              <GoogleG /> Continue with Google
            </SubmitButton>
          </form>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or use your mobile number <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form action={action} className="space-y-3">
        <div>
          <label className="label" htmlFor="phone">Mobile number</label>
          <input id="phone" name="phone" className="input" inputMode="tel" placeholder="0771234567" required autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="pin">6-digit PIN</label>
          <input id="pin" name="pin" className="input tracking-[0.5em]" inputMode="numeric" pattern="\d{6}" maxLength={6} type="password" required autoComplete="current-password" />
        </div>
        <FormMessage state={state} />
        <SubmitButton className="btn-primary w-full" pendingText="Logging in…">Log in</SubmitButton>
      </form>
    </div>
  );
}
