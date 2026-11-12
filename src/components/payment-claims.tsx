import { CheckCircle, Clock, XCircle } from "@phosphor-icons/react/ssr";
import { decideClaim } from "@/app/actions/money";
import type { Claim } from "@/lib/claims";
import { fmtDay } from "@/lib/time";
import { rs } from "@/lib/types";
import { OrgField } from "@/components/org-field";
import { SubmitButton } from "@/components/ui";

const first = (name: string) => name.trim().split(" ")[0];

function Decide({ id, decision, children, className, pendingText }: {
  id: string;
  decision: "confirm" | "decline" | "cancel";
  children: React.ReactNode;
  className: string;
  pendingText: string;
}) {
  return (
    <form action={decideClaim}>
      <OrgField />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <SubmitButton className={className} pendingText={pendingText}>{children}</SubmitButton>
    </form>
  );
}

/**
 * "Paid earlier" payments on Home (lib/claims.ts): ones I confirm, ones I'm waiting on, and ones
 * that were turned down in the last two weeks.
 */
export function PaymentClaims({
  me,
  toDecide,
  waiting,
  declined,
  names,
  confirmerName,
}: {
  me: string;
  toDecide: Claim[];
  waiting: Claim[];
  declined: Claim[];
  names: Map<string, string>;
  /** who confirms this one: the receiver's first name, or "an admin" for a guest */
  confirmerName: (c: Claim) => string;
}) {
  if (!toDecide.length && !waiting.length && !declined.length) return null;
  const name = (id: string | null) => (id && names.get(id)) || "Someone";

  return (
    <section className="space-y-2">
      {toDecide.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-muted">Confirm a payment</h2>
          <ul className="card divide-y divide-line py-1">
            {toDecide.map((c) => (
              <li key={c.id} className="space-y-2 py-3">
                <p className="text-sm">
                  <b>{name(c.from_person)}</b> says they paid{" "}
                  {c.to_person === me ? "you" : <b>{name(c.to_person)}</b>}{" "}
                  <b className="tabular-nums">{rs(c.amount)}</b> on {fmtDay(c.paid_on)}.
                  {c.note && <span className="text-muted"> “{c.note}”</span>}
                </p>
                <p className="text-xs text-muted">
                  {c.to_person === me
                    ? "It counts in the balances once you confirm you got it."
                    : `${first(name(c.to_person))} doesn't have the app, so you confirm it. It counts once you do.`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Decide id={c.id} decision="confirm" className="btn-primary min-h-9 px-4 py-1.5 text-sm" pendingText="Confirming…">
                    <CheckCircle size={16} weight="bold" aria-hidden="true" /> {c.to_person === me ? "Yes, I got it" : "Confirm"}
                  </Decide>
                  <Decide id={c.id} decision="decline" className="btn-ghost min-h-9 px-4 py-1.5 text-sm" pendingText="Saving…">
                    Not received
                  </Decide>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {waiting.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-muted">Waiting to be confirmed</h2>
          <ul className="card divide-y divide-line py-1">
            {waiting.map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-3">
                <Clock size={18} className="mt-0.5 shrink-0 text-amber-ink" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-sm">
                  <p>
                    {c.from_person === me ? (
                      <>Your <b className="tabular-nums">{rs(c.amount)}</b> to {name(c.to_person)}</>
                    ) : (
                      <>{name(c.from_person)} paying {name(c.to_person)} <b className="tabular-nums">{rs(c.amount)}</b></>
                    )}{" "}
                    on {fmtDay(c.paid_on)} is waiting for {confirmerName(c)} to confirm.
                  </p>
                  {c.from_person === me && (
                    <p className="mt-0.5 text-xs text-muted">It isn&apos;t in your balance yet, so don&apos;t pay it again.</p>
                  )}
                </div>
                {c.recorded_by === me && (
                  <Decide id={c.id} decision="cancel" className="btn-ghost min-h-8 shrink-0 px-3 py-1 text-xs" pendingText="Cancelling…">
                    Cancel
                  </Decide>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {declined.map((c) => (
        <p key={c.id} className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          <XCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {first(name(c.decided_by))} said {c.decided_by === c.to_person ? "they didn't" : `${first(name(c.to_person))} didn't`} get{" "}
            {c.from_person === me ? "your" : `${first(name(c.from_person))}'s`} {rs(c.amount)} from {fmtDay(c.paid_on)}, so it
            isn&apos;t counted. Talk to them, and record it again if it was paid.
          </span>
        </p>
      ))}
    </section>
  );
}
