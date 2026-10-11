"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, LinkSimple, UsersThree, Wallet } from "@phosphor-icons/react/ssr";
import { finishWelcome } from "@/app/actions/auth";
import { CURRENCIES, currencySymbol, money } from "@/lib/currency";
import { suggestBudget } from "@/lib/periods";
import { ORG_KINDS, type OrgKind } from "@/lib/types";
import { ActionForm, FormMessage, PillSubmit } from "@/components/ui";
import { ConnectPhoneForm } from "@/components/sign-in-forms";

type Choice = "budget" | "group" | "join";

const CHOICES: { id: Choice; icon: typeof Wallet; title: string; body: string }[] = [
  { id: "budget", icon: Wallet, title: "Track my own spending", body: "Set a monthly budget and see what you can spend each day." },
  { id: "group", icon: UsersThree, title: "Split costs with a group", body: "Start a group for the office, friends, a trip or family." },
  { id: "join", icon: LinkSimple, title: "Join a group", body: "Someone sent you an invite link." },
];

/**
 * Three short steps in one form: about you, what first, then the details for that choice.
 * Every step's fields stay in the form (hidden ones too), so the last submit carries them all.
 */
export function WelcomeForm({
  name,
  currency,
  income,
  hasPhone,
}: {
  name: string;
  currency: string;
  income: number | null;
  hasPhone: boolean;
}) {
  const [state, action] = useActionState(finishWelcome, null);
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(name);
  const [cur, setCur] = useState(currency);
  const [pay, setPay] = useState(income ? String(income) : "");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [budget, setBudget] = useState("");
  const [kind, setKind] = useState<OrgKind>("office");
  const heading = useRef<HTMLHeadingElement>(null);

  const payNum = Number(pay.replace(/,/g, ""));
  const suggestion = suggestBudget(payNum > 0 ? payNum : null, "month");

  // Move focus to the new step's heading, so screen readers and keyboards follow along.
  useEffect(() => {
    if (step > 0) heading.current?.focus();
  }, [step]);

  const go = (n: number) => {
    if (n === 2 && choice === "budget" && !budget && suggestion) setBudget(String(suggestion));
    setStep(n);
  };

  return (
    <div className="stagger flex-1 space-y-6 pt-4">
      <p className="text-xs font-medium tracking-[0.14em] text-muted uppercase">Step {step + 1} of 3</p>
      <ActionForm
        action={action}
        className="space-y-6"
        onKeyDown={(e) => {
          // Enter in the first two steps moves on instead of submitting (which would skip the rest).
          if (e.key !== "Enter" || step === 2 || (e.target as HTMLElement).tagName !== "INPUT") return;
          e.preventDefault();
          if (step === 0 && fullName.trim()) go(1);
        }}
      >
        <input type="hidden" name="choice" value={step === 2 && choice ? choice : "skip"} />

        <section hidden={step !== 0} className="space-y-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Welcome to Kotasa</h1>
            <p className="mt-1 text-muted">A couple of things first. You can change them later.</p>
          </div>
          <div>
            <label className="label" htmlFor="full_name">Your name</label>
            <input
              id="full_name"
              name="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={60}
              className="input min-h-12 rounded-2xl"
              autoComplete="name"
            />
            <p className="mt-1 text-xs text-muted">This is how your groups will see you.</p>
          </div>
          <div>
            <label className="label" htmlFor="currency">Currency</label>
            <select id="currency" name="currency" value={cur} onChange={(e) => setCur(e.target.value)} className="input min-h-12 rounded-2xl">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="monthly_income">
              Monthly take-home pay <span className="font-normal text-muted">(optional)</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted">{currencySymbol(cur)}</span>
              <input
                id="monthly_income"
                name="monthly_income"
                value={pay}
                onChange={(e) => setPay(e.target.value)}
                inputMode="decimal"
                className="input min-h-12 rounded-2xl pl-14"
                placeholder="150,000"
                autoComplete="off"
              />
            </div>
            <p className="mt-1 text-xs text-muted">Only you see this. Kotasa uses it to suggest a budget.</p>
          </div>
          <button type="button" className="btn-primary min-h-12 w-full rounded-full" disabled={!fullName.trim()} onClick={() => go(1)}>
            Continue <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </button>
        </section>

        <section hidden={step !== 1} className="space-y-5">
          <div>
            <h1 ref={step === 1 ? heading : undefined} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
              What do you want to do first?
            </h1>
            <p className="mt-1 text-muted">You can do all of these later.</p>
          </div>
          <div className="space-y-3" role="radiogroup" aria-label="What do you want to do first?">
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={choice === c.id}
                onClick={() => setChoice(c.id)}
                className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                  choice === c.id ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-surface-2"
                }`}
              >
                <span
                  className={`inline-flex size-11 shrink-0 items-center justify-center rounded-[32%] ${
                    choice === c.id ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"
                  }`}
                >
                  <c.icon size={20} weight="duotone" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className={`block font-semibold ${choice === c.id ? "text-brand-strong" : ""}`}>{c.title}</span>
                  <span className="text-sm text-muted">{c.body}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn-ghost min-h-12 rounded-full px-5" onClick={() => go(0)}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <button type="button" className="btn-primary min-h-12 flex-1 rounded-full" disabled={!choice} onClick={() => go(2)}>
              Continue <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </section>

        <section hidden={step !== 2} className="space-y-5">
          <div hidden={choice !== "budget"} className="space-y-5">
            <div>
              <h1 ref={step === 2 && choice === "budget" ? heading : undefined} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
                Your monthly budget
              </h1>
              <p className="mt-1 text-muted">
                How much do you want to spend in a month, on everything? Kotasa splits it into a safe amount for each day.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="budget">Budget for a month</label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted">{currencySymbol(cur)}</span>
                <input
                  id="budget"
                  name="budget"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  inputMode="decimal"
                  className="input min-h-12 rounded-2xl pl-14 text-lg font-semibold tabular-nums"
                  placeholder="60,000"
                  autoComplete="off"
                />
              </div>
              {suggestion && (
                <p className="mt-1 text-xs text-muted">Suggested from your pay: {money(suggestion, cur)}. Lower it to save some.</p>
              )}
            </div>
          </div>

          <div hidden={choice !== "group"} className="space-y-5">
            <div>
              <h1 ref={step === 2 && choice === "group" ? heading : undefined} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
                Start a group
              </h1>
              <p className="mt-1 text-muted">You&apos;ll be its owner. Invite people from the group once it&apos;s made.</p>
            </div>
            <div>
              <label className="label" htmlFor="group-name">Group name</label>
              <input id="group-name" name="name" maxLength={60} className="input min-h-12 rounded-2xl" placeholder="Colombo office" autoComplete="off" />
            </div>
            <fieldset>
              <legend className="label">What is it for?</legend>
              <input type="hidden" name="kind" value={kind} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ORG_KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={kind === k.id}
                    onClick={() => setKind(k.id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${kind === k.id ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}
                  >
                    <span className={`block text-sm font-semibold ${kind === k.id ? "text-brand-strong" : ""}`}>{k.label}</span>
                    <span className="text-xs text-muted">{k.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div hidden={choice !== "join"} className="space-y-5">
            <div>
              <h1 ref={step === 2 && choice === "join" ? heading : undefined} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
                Join a group
              </h1>
              <p className="mt-1 text-muted">Paste the invite link. You&apos;ll see the group before you join.</p>
            </div>
            <div>
              <label className="label" htmlFor="invite">Invite link</label>
              <input id="invite" name="invite" className="input min-h-12 rounded-2xl" placeholder="https://…/join/…" autoComplete="off" inputMode="url" />
            </div>
          </div>

          <FormMessage state={state} />
          <div className="flex gap-3">
            <button type="button" className="btn-ghost min-h-12 rounded-full px-5" onClick={() => go(1)}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <div className="flex-1">
              <PillSubmit pendingText="Setting up…">
                {choice === "budget" ? "Start budgeting" : choice === "group" ? "Create group" : "Continue"}
              </PillSubmit>
            </div>
          </div>
        </section>

        {step < 2 && (
          <>
            <FormMessage state={state} />
            <div className="text-center">
              <button type="submit" className="text-sm font-medium text-muted underline-offset-2 hover:text-ink hover:underline" disabled={!fullName.trim()}>
                Skip for now
              </button>
            </div>
          </>
        )}
      </ActionForm>

      {step === 0 && !hasPhone && (
        // Its own form, outside the one above: forms can't be nested.
        <details className="rounded-2xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Already use Kotasa with your mobile number?</summary>
          <p className="mt-2 text-sm text-muted">
            Enter that number and its PIN. Your Google login joins that account, so your groups and history stay
            together.
          </p>
          <div className="pt-3">
            <ConnectPhoneForm back="me" />
          </div>
        </details>
      )}
    </div>
  );
}
