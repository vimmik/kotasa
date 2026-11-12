import Link from "next/link";
import { notFound } from "next/navigation";
import { BellRinging, ClockCounterClockwise } from "@phosphor-icons/react/ssr";
import { requireMember } from "@/lib/auth";
import { appUrl } from "@/lib/brand";
import { closedThrough } from "@/lib/closing";
import { getDirectBalance, getLedgerBetween, getPairs, listMembers, summarize } from "@/lib/ledger";
import { remindText } from "@/lib/messages";
import { expenseIconMap } from "@/lib/org-config";
import { payDetailsFor } from "@/lib/pay-details";
import { fmtDay } from "@/lib/time";
import { round2, rs } from "@/lib/types";
import { ActivityList } from "@/components/activity";
import { Avatar, EmptyState } from "@/components/bits";
import { PayTo, ShareButton } from "@/components/share";

/** Lines shown between two people; older ones are still counted in the totals. */
const LINES = 400;

// "Why do I owe Kasun this much?" The amount to settle, what is directly between the two of you,
// why those can differ (fewest payments, closed books), and every line between you.
export default async function WithPage(props: PageProps<"/g/[slug]/with/[id]">) {
  const { slug, id } = await props.params;
  const ctx = await requireMember(slug);
  const { org, member: me, base } = ctx;
  if (!/^[0-9a-f-]{36}$/.test(id) || id === me.id) notFound();

  const [people, pairs, direct, rows, through, payTo] = await Promise.all([
    listMembers(org.id, { includeInactive: true }),
    getPairs(org.id),
    getDirectBalance(org.id, me.id, id),
    getLedgerBetween(org.id, me.id, id, LINES),
    closedThrough(org.id),
    payDetailsFor(org.id),
  ]);
  const other = people.find((p) => p.id === id);
  if (!other) notFound();
  const first = other.full_name.split(" ")[0];
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const icons = await expenseIconMap(org.id, rows.filter((r) => r.source === "expense").map((r) => r.ref_id));

  // + means they owe me. `settle` is what Home shows; `direct` is only the lines between us two.
  const b = summarize(me.id, pairs);
  const settle = round2((b.owed.find((o) => o.personId === id)?.amount ?? 0) - (b.owes.find((o) => o.personId === id)?.amount ?? 0));
  const moved = round2(settle - direct);
  const say = (v: number) => (v > 0.004 ? `${first} owes you ${rs(v)}` : v < -0.004 ? `You owe ${first} ${rs(-v)}` : "Nothing either way");

  return (
    <div className="stagger mx-auto max-w-2xl space-y-5">
      <section className="card space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={other.full_name} size={44} />
          <div className="min-w-0">
            <p className="text-sm text-muted">You and</p>
            <h1 className="truncate text-xl font-semibold">{other.full_name}</h1>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">To settle now</p>
          <p className={`text-3xl font-semibold tracking-tight tabular-nums ${settle > 0.004 ? "text-brand" : settle < -0.004 ? "text-danger" : ""}`}>
            {Math.abs(settle) < 0.005 ? "Nothing to pay" : rs(Math.abs(settle))}
          </p>
          {Math.abs(settle) >= 0.005 && <p className="text-sm text-muted">{settle > 0 ? `${first} pays you` : `You pay ${first}`}</p>}
        </div>
        {settle < -0.004 && payTo.get(id) && <PayTo details={payTo.get(id)!} className="text-sm" />}
        <div className="flex flex-wrap gap-2">
          {settle < -0.004 && (
            <Link href={`${base}/settle?to=${id}&amount=${-settle}`} className="btn-primary">
              Pay {first} {rs(-settle)}
            </Link>
          )}
          {settle > 0.004 && (
            <>
              <Link href={`${base}/settle?from=${id}&amount=${settle}`} className="btn-primary">
                Got paid
              </Link>
              <ShareButton
                text={remindText({
                  to: other.full_name,
                  group: org.name,
                  amount: settle,
                  payDetails: payTo.get(me.id),
                  link: other.registered ? `${appUrl()}${base}/settle?to=${me.id}&amount=${settle}` : undefined,
                })}
              >
                <BellRinging size={16} aria-hidden="true" /> Remind {first}
              </ShareButton>
            </>
          )}
          <Link href={base} className="btn-ghost">
            Back
          </Link>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">How it adds up</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Directly between you two</dt>
            <dd className="text-right font-medium tabular-nums">{say(direct)}</dd>
          </div>
          {Math.abs(moved) > 0.004 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Moved here from other people</dt>
              <dd className="text-right font-medium tabular-nums">{say(moved)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
            <dt>To settle now</dt>
            <dd className="text-right tabular-nums">{say(settle)}</dd>
          </div>
        </dl>
        {Math.abs(moved) > 0.004 && (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            {ctx.settings.simplify_debts !== false
              ? `${org.name} settles with the fewest payments. When money would pass through a middle person (you pay someone, and they pay ${first}), it goes straight instead, so nobody pays twice. That is why this amount isn't the same as what is directly between you two. `
              : ""}
            {through ? `Balances up to ${fmtDay(through)} were closed and are carried forward as they were. ` : ""}
            What you owe or get back across the whole group stays the same: {b.net > 0.004 ? `you're owed ${rs(b.net)}` : b.net < -0.004 ? `you owe ${rs(-b.net)}` : "you're all settled"} in total.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Everything between you two</h2>
        {rows.length === 0 ? (
          <EmptyState icon={ClockCounterClockwise} title="Nothing yet" body={`You and ${first} haven't shared a cost or a payment in ${org.name}.`} />
        ) : (
          <div className="card py-1">
            <ActivityList rows={rows} me={me.id} names={names} icons={icons} base={base} />
          </div>
        )}
        {rows.length >= LINES && (
          <p className="text-center text-xs text-muted">Showing the latest {LINES} lines. Older ones are still counted in the totals above.</p>
        )}
      </section>
    </div>
  );
}
