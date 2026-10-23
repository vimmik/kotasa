import Link from "next/link";
import { ArrowRight, BookOpenText, CheckCircle, ForkKnife } from "@phosphor-icons/react/ssr";
import { requireMember } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { closedThrough } from "@/lib/closing";
import { getLedgerFor, getPairs, listMembers, summarize } from "@/lib/ledger";
import { expenseIconMap, getMealSlots } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { fmtDay, isPastCutoff, todayColombo } from "@/lib/time";
import { rs } from "@/lib/types";
import { ActivityList } from "@/components/activity";
import { Avatar, EmptyState, PayNote } from "@/components/bits";

export default async function Home(props: PageProps<"/g/[slug]">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  const { org, member: me, base } = ctx;
  const meals = ctx.settings.meals_enabled;
  const sp = await props.searchParams;
  const today = todayColombo();

  const [people, pairs, rows, { data: todays }, slots, { data: myJoins }, through] = await Promise.all([
    listMembers(org.id, { includeInactive: true }),
    getPairs(org.id),
    // Several lines make one item (one per person in an expense), so read more than are shown.
    getLedgerFor(org.id, me.id, { limit: 40 }),
    meals
      ? orgDb(org.id).select("orders", "meal, item_name, qty").eq("person_id", me.id).eq("order_date", today)
      : Promise.resolve({ data: [] as { meal: string; item_name: string; qty: number }[] }),
    meals ? getMealSlots(org.id, { includeArchived: true }) : Promise.resolve([]),
    meals
      ? orgDb(org.id).select("meal_joins", "meal").eq("member_id", me.id).eq("join_date", today)
      : Promise.resolve({ data: [] as { meal: string }[] }),
    closedThrough(org.id),
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const slotLabel = new Map(slots.map((s) => [s.key, s.label]));
  const b = summarize(me.id, pairs);
  // Once every meal of the day is past its cutoff, point people at tomorrow instead.
  const openSlots = slots.filter((s) => !s.archived);
  const mealsClosed = openSlots.length > 0 && openSlots.every((s) => isPastCutoff(today, s.cutoff));
  const icons = await expenseIconMap(
    org.id,
    rows.filter((r) => r.source === "expense").map((r) => r.ref_id),
  );

  return (
    <div className="stagger space-y-6">
      {sp.settled === "1" && (
        <p className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-strong">
          <CheckCircle size={16} weight="fill" aria-hidden="true" /> Payment recorded
        </p>
      )}

      <section className="card relative overflow-hidden p-0">
        {/* soft brand glow in the corner, tinted by the theme */}
        <div
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-brand-soft opacity-70 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative px-5 pt-5 pb-6">
          <p className="text-sm text-muted">Hi {me.full_name.split(" ")[0]}</p>
          {Math.abs(b.net) < 0.01 ? (
            <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">All settled</p>
          ) : (
            <>
              <p className="mt-3 text-sm font-medium">{b.net > 0 ? "You're owed" : "You owe"}</p>
              <p
                className={`text-4xl font-semibold tracking-[-0.03em] tabular-nums sm:text-5xl ${b.net > 0 ? "text-brand" : "text-danger"}`}
              >
                {rs(Math.abs(b.net))}
              </p>
            </>
          )}
          <p className="mt-1 text-xs text-muted">
            Net across everyone in {org.name}
            {through && ` · closed up to ${fmtDay(through)}`}
          </p>
        </div>
        <div className="relative grid grid-cols-2 border-t border-line text-sm">
          <div className="border-r border-line px-5 py-4">
            <p className="text-xs text-muted">You owe</p>
            <p className={`mt-0.5 font-semibold tabular-nums ${b.totalOwe > 0.004 ? "text-danger" : "text-muted"}`}>{rs(b.totalOwe)}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-muted">Owed to you</p>
            <p className={`mt-0.5 font-semibold tabular-nums ${b.totalOwed > 0.004 ? "text-brand" : "text-muted"}`}>{rs(b.totalOwed)}</p>
          </div>
        </div>
      </section>

      {(b.owes.length > 0 || b.owed.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {b.owes.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted">You owe</h2>
              <ul className="card divide-y divide-line py-1">
                {b.owes.map((o) => (
                  <BalanceRow
                    key={o.personId}
                    name={names.get(o.personId) ?? "?"}
                    line={`You owe ${rs(o.amount)}`}
                    tone="text-danger"
                    href={`${base}/settle?to=${o.personId}&amount=${o.amount}`}
                    action="Pay"
                  />
                ))}
              </ul>
            </section>
          )}
          {b.owes.length > 0 && ctx.settings.pay_note?.trim() && (
            <div className="md:col-span-2">
              <PayNote note={ctx.settings.pay_note.trim()} />
            </div>
          )}
          {b.owed.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted">Owes you</h2>
              <ul className="card divide-y divide-line py-1">
                {b.owed.map((o) => (
                  <BalanceRow
                    key={o.personId}
                    name={names.get(o.personId) ?? "?"}
                    line={`Owes you ${rs(o.amount)}`}
                    tone="text-brand"
                    href={`${base}/settle?from=${o.personId}&amount=${o.amount}`}
                    action="Got paid"
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {meals && (
      <Link href={`${base}/meals`} className="card-link flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-amber-soft text-amber-ink">
          <ForkKnife size={18} weight="duotone" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Today&apos;s meals</p>
          <p className="truncate text-sm text-muted">
            {todays?.length || myJoins?.length
              ? [
                  ...(todays ?? []).map((o) => `${slotLabel.get(o.meal) ?? o.meal}: ${o.item_name}${o.qty > 1 ? ` ×${o.qty}` : ""}`),
                  ...((myJoins ?? []) as { meal: string }[]).map((j) => `${slotLabel.get(j.meal) ?? j.meal}: shared bill`),
                ].join(" · ")
              : mealsClosed
                ? "Ordering for today is closed. Plan your next meals."
                : "Nothing ordered yet. Pick yours for today."}
          </p>
        </div>
        <ArrowRight size={18} className="text-muted" aria-hidden="true" />
      </Link>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">Recent activity</h2>
          <Link href={`${base}/account#history`} className="text-sm font-semibold text-brand">See all</Link>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="No activity yet"
            body="Add a shared cost — an Uber, a cake, lunch for the team — and split it with people."
            action={<Link href={`${base}/expenses/new`} className="btn-primary">Add expense</Link>}
          />
        ) : (
          <div className="card py-1">
            <ActivityList rows={rows} me={me.id} names={names} icons={icons} base={base} max={8} />
          </div>
        )}
      </section>

      <Link href={`${base}/guide`} className="card-link flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
          <BookOpenText size={18} weight="duotone" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">How {BRAND.name} works</p>
          <p className="truncate text-sm text-muted">What it does, how to split and settle, and the weekly SMS</p>
        </div>
        <ArrowRight size={18} className="text-muted" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** One person you owe or who owes you: the amount sits under the name, so long names fit on a phone. */
function BalanceRow({ name, line, tone, href, action }: { name: string; line: string; tone: string; href: string; action: string }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        <p className={`text-sm font-medium tabular-nums ${tone}`}>{line}</p>
      </div>
      <Link href={href} className="btn-ghost shrink-0 px-3 py-1.5 text-xs">
        {action}
      </Link>
    </li>
  );
}
