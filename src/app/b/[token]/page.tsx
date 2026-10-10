import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLedgerFor, getPairs, listPeople, summarize } from "@/lib/ledger";
import { BRAND } from "@/lib/brand";
import { addDays, todayColombo } from "@/lib/time";
import { rs, type Person } from "@/lib/types";
import { ActivityList } from "@/components/activity";
import { Avatar, Loading, Money } from "@/components/bits";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Your bill", robots: { index: false, follow: false } };

// Read-only bill for people who don't use the app (linked from the weekly SMS).
export default function BillPage(props: PageProps<"/b/[token]">) {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-12">
      <header className="flex h-16 items-center justify-between">
        <Logo href="/login" />
        <ThemeToggle compact />
      </header>
      <Suspense fallback={<Loading />}>
        <Bill params={props.params} />
      </Suspense>
    </div>
  );
}

async function Bill({ params }: { params: PageProps<"/b/[token]">["params"] }) {
  const { token } = await params;
  if (!/^[0-9a-f]{24}$/.test(token)) notFound();
  const { data } = await createAdminClient().from("people").select("*").eq("view_token", token).maybeSingle();
  if (!data || data.status === "inactive") notFound();
  const me = data as Person;

  const [people, pairs, rows] = await Promise.all([
    listPeople({ includeInactive: true }),
    getPairs(),
    getLedgerFor(me.id, { from: addDays(todayColombo(), -45), limit: 150 }),
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const b = summarize(me.id, pairs);

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex items-center gap-3">
          <Avatar name={me.full_name} size={44} />
          <div>
            <p className="text-sm text-muted">Bill for</p>
            <h1 className="text-xl font-semibold">{me.full_name}</h1>
          </div>
        </div>
        <p className="mt-4 text-3xl font-semibold tracking-tight">
          {b.totalOwe > 0 ? (
            <>
              You owe <span className="text-danger">{rs(b.totalOwe)}</span>
            </>
          ) : (
            "Nothing to pay"
          )}
        </p>
        {b.totalOwed > 0 && <p className="mt-1 text-sm text-muted">Others owe you {rs(b.totalOwed)}.</p>}
      </section>

      {(b.owes.length > 0 || b.owed.length > 0) && (
        <section className="card py-1">
          <ul className="divide-y divide-line">
            {b.owes.map((o) => (
              <li key={`o-${o.personId}`} className="flex items-center gap-3 py-2.5">
                <Avatar name={names.get(o.personId) ?? "?"} size={32} />
                <span className="flex-1 font-medium">Pay {names.get(o.personId)}</span>
                <Money value={-o.amount} signed className="text-sm" />
              </li>
            ))}
            {b.owed.map((o) => (
              <li key={`d-${o.personId}`} className="flex items-center gap-3 py-2.5">
                <Avatar name={names.get(o.personId) ?? "?"} size={32} />
                <span className="flex-1 font-medium">{names.get(o.personId)} owes you</span>
                <Money value={o.amount} signed className="text-sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Where it came from (last 45 days)</h2>
        {rows.length === 0 ? (
          <p className="card text-sm text-muted">No activity.</p>
        ) : (
          <div className="card py-1">
            <ActivityList rows={rows} me={me.id} names={names} linkExpenses={false} />
          </div>
        )}
      </section>

      <section className="card space-y-2 bg-brand-soft">
        <h2 className="font-semibold text-brand-strong">Get more with the {BRAND.name} app</h2>
        <p className="text-sm text-ink">
          Order breakfast and lunch yourself, add and split costs like rides, record payments and see your full history.
          Ask your admin to set you up, or sign in with Google and they&apos;ll approve you.
        </p>
        <Link href="/login" className="btn-primary">Open {BRAND.name}</Link>
      </section>
    </div>
  );
}
