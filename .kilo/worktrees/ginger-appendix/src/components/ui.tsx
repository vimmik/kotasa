"use client";

import { useFormStatus } from "react-dom";
import { Printer } from "lucide-react";
import type { ActionState } from "@/lib/types";

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "Saving…",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || rest.disabled} className={className} {...rest}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  if (state.message)
    return <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-strong">{state.message}</p>;
  return null;
}

export function PrintButton() {
  return (
    <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
      <Printer size={16} aria-hidden="true" /> Print
    </button>
  );
}
