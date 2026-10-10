import Link from "next/link";
import { ArrowRight, CheckCircle2, Utensils } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { getLedgerFor, getPairs, listPeople, summarize } from "@/lib/ledger";
import { createAdminClient } from "@/lib/supabase/server";
import { todayColombo } from "@/lib/time";
import { rs } from "@/lib/types";
import { ActivityList } from "@/components/activity";
import { Avatar, EmptyState, Money } from "@/components/bits";

export default async function Home(props: PageProps<"/">) {
  const me = await requireMember();
  const sp = await props.searchParams;
  const today = todayColombo();

  const [people, pairs, rows, { data: todays }] = await Promise.all([
    listPeople({ includeInactive: true }),
    getPairs(),
    getLedgerFor(me.id, { limit: 12 }),
    createAdminClient().from("orders").select("meal, item_name, qty").eq("person_id", me.id).eq("order_date", today),
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const b = summarize(me.id, pairs);

  const expenseIds = rows.filter((r) => r.source === "expense").map((r) => r.ref_id);
  const { data: cats } = expenseIds.length
    ? await createAdminClient().from("expenses").select("id, category").in("id", expenseIds)
    : { data: [] };
  const categories = Object.fromEntries((cats ?? []).map((c) => [c.id, c.category]));

  return (
    <div className="space-y-6">
      {sp.settled === "1" && (
        <p className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-strong">
          <CheckCircle2 size={16} aria-hidden="true" /> Payment recorded
        </p>
      )}

      <section className="card overflow-hidden p-0">
        <div className="p-5">
          <p className="text-sm text-muted">Hi {me.full_name.split(" ")[0]} — overall</p>
          {Math.abs(b.net) < 0.01 ? (
            <p className="mt-1 text-3xl font-extrabold tracking-tight">You&apos;re all settled</p>
          ) : (
            <p className="mt-1 text-3xl font-extrabold tracking-tight">
              {b.net > 0 ? "You're owed " : "You owe "}
              <span className={b.net > 0 ? "text-brand" : "text-danger"}>{rs(Math.abs(b.net))}</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 border-t border-line text-sm">
          <div className="border-r border-line p-4">
            <p className="text-xs text-muted">You owe</p>
            <p className="font-bold text-danger">{rs(b.totalOwe)}</p>
          </div>
          <div className="p-4">
            <p className="text-xs text-muted">Owed to you</p>
            <p className="font-bold text-brand">{rs(b.totalOwed)}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted">You owe</h2>
          {b.owes.length === 0 ? (
            <p className="card text-sm text-muted">Nothing — nice.</p>
          ) : (
            <ul className="card divide-y divide-line py-1">
              {b.owes.map((o) => (
                <li key={o.personId} className="flex items-center gap-3 py-2.5">
                  <Avatar name={names.get(o.personId) ?? "?"} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{names.get(o.personId)}</span>
                  <Money value={-o.amount} signed className="text-sm" />
                  <Link href={`/settle?to=${o.personId}&amount=${o.amount}`} className="btn-ghost px-3 py-1 text-xs">
                    Settle
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted">Owes you</h2>
          {b.owed.length === 0 ? (
            <p className="card text-sm text-muted">Nobody owes you right now.</p>
          ) : (
            <ul className="card divide-y divide-line py-1">
              {b.owed.map((o) => (
                <li key={o.personId} className="flex items-center gap-3 py-2.5">
                  <Avatar name={names.get(o.personId) ?? "?"} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{names.get(o.personId)}</span>
                  <Money value={o.amount} signed className="text-sm" />
                  <Link href={`/settle?from=${o.personId}&amount=${o.amount}`} className="btn-ghost px-3 py-1 text-xs">
                    Got paid
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Link href="/meals" className="card flex items-center gap-3 hover:bg-surface-2">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-amber-soft text-amber-ink">
          <Utensils size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Today&apos;s meals</p>
          <p className="truncate text-sm text-muted">
            {todays?.length
              ? todays.map((o) => `${o.meal === "breakfast" ? "Breakfast" : "Lunch"}: ${o.item_name}${o.qty > 1 ? ` ×${o.qty}` : ""}`).join(" · ")
              : "Nothing ordered yet — pick breakfast or lunch"}
          </p>
        </div>
        <ArrowRight size={18} className="text-muted" aria-hidden="true" />
      </Link>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-muted">Recent activity</h2>
          <Link href="/account#history" className="text-sm font-semibold text-brand">See all</Link>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="No activity yet"
            body="Add a shared cost — an Uber, a cake, lunch for the team — and split it with people."
            action={<Link href="/expenses/new" className="btn-primary">Add expense</Link>}
          />
        ) : (
          <div className="card py-1">
            <ActivityList rows={rows} me={me.id} names={names} categories={categories} />
          </div>
        )}
      </section>
    </div>
  );
}
