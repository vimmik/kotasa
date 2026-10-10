"use client";

import { createContext, use, useId, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Printer, WarningCircle } from "@phosphor-icons/react/ssr";
import type { ActionState } from "@/lib/types";

const PendingContext = createContext(false);

/**
 * A form that runs its action without React's automatic reset. With `<form action>`, React 19
 * clears every uncontrolled field once the action returns, even when it returns an error, so a
 * typo would wipe what the person typed. Use this for forms that can come back with an error.
 */
export function ActionForm({
  action,
  children,
  ...rest
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & { action: (f: FormData) => void }) {
  const [pending, start] = useTransition();
  return (
    <form
      {...rest}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const data = new FormData(e.currentTarget, submitter);
        start(() => action(data));
      }}
    >
      <PendingContext value={pending}>{children}</PendingContext>
    </form>
  );
}

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "Saving…",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const status = useFormStatus();
  const pending = status.pending || use(PendingContext);
  return (
    <button type="submit" disabled={pending || rest.disabled} className={className} {...rest}>
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * A submit button that asks first, in the app's own dialog instead of the browser's confirm().
 * The dialog lives inside the form, so its confirm button submits the form like any submit button.
 * `message` can be a function, read each time the dialog opens (e.g. "Send to 4 people?").
 */
export function ConfirmButton({
  children,
  className = "btn-primary",
  pendingText = "Saving…",
  title,
  message,
  confirmText,
  danger = false,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  title: string;
  message: React.ReactNode | (() => React.ReactNode);
  confirmText: string;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [body, setBody] = useState<React.ReactNode>(null);
  const status = useFormStatus();
  const pending = status.pending || use(PendingContext);
  const close = () => ref.current?.close();
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          setBody(typeof message === "function" ? message() : message);
          ref.current?.showModal();
        }}
      >
        {pending ? pendingText : children}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="confirm-dialog"
        // Click on the backdrop (outside the panel) closes it.
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className="flex gap-3">
          <span
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-strong"}`}
          >
            <WarningCircle size={20} weight="duotone" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="font-semibold">
              {title}
            </h2>
            <div className="text-sm text-muted">{body}</div>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={close} autoFocus>
            Cancel
          </button>
          <button type="submit" className={danger ? "btn-danger" : "btn-primary"} onClick={close}>
            {confirmText}
          </button>
        </div>
      </dialog>
    </>
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
