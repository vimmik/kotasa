"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react/ssr";
import { setMyPin } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/ui";

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [state, action] = useActionState(setMyPin, null);
  return (
    <form action={action} className="space-y-3" key={state?.ok ? "done" : "form"}>
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
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={url} className="input font-mono text-xs" aria-label="Your bill link" onFocus={(e) => e.target.select()} />
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
