"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight, Printer } from "@phosphor-icons/react/ssr";
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

/** Big pill submit with the arrow nested in its own circle; the arrow nudges forward on hover. */
export function PillSubmit({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  return (
    <SubmitButton className="btn-primary group min-h-12 w-full justify-between rounded-full py-1.5 pr-1.5 pl-6 text-[15px]" pendingText={pendingText}>
      <span>{children}</span>
      <span className="flex size-9 items-center justify-center rounded-full bg-white/20 transition-transform duration-300 ease-(--ease-out-soft) group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105">
        <ArrowRight size={16} weight="bold" aria-hidden="true" />
      </span>
    </SubmitButton>
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
