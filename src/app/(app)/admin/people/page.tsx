import { requireAdmin } from "@/lib/auth";
import { getPairs, listPeople, summarize } from "@/lib/ledger";
import { AddPersonForm, PendingRow, PersonRow } from "@/components/people-forms";

export default async function PeoplePage() {
  const me = await requireAdmin();
  const [all, pairs] = await Promise.all([listPeople({ includeInactive: true }), getPairs()]);
  const pending = all.filter((p) => p.status === "pending");
  const active = all.filter((p) => p.status === "active");
  const inactive = all.filter((p) => p.status === "inactive");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">People</h1>

      {pending.length > 0 && (
        <section className="card border-amber">
          <h2 className="font-semibold">Waiting for approval ({pending.length})</h2>
          <p className="text-xs text-muted">They signed in with Google. Link them to someone you already added, or approve as new.</p>
          <ul className="divide-y divide-line">
            {pending.map((p) => (
              <PendingRow key={p.id} p={p} people={active} />
            ))}
          </ul>
        </section>
      )}

      <AddPersonForm />

      <section className="card py-1">
        <h2 className="pt-3 font-semibold">Active ({active.length})</h2>
        <ul className="divide-y divide-line">
          {active.map((p) => (
            <PersonRow key={p.id} p={p} net={summarize(p.id, pairs).net} isSelf={p.id === me.id} />
          ))}
        </ul>
      </section>

      {inactive.length > 0 && (
        <section className="card py-1">
          <h2 className="pt-3 font-semibold">Inactive ({inactive.length})</h2>
          <ul className="divide-y divide-line">
            {inactive.map((p) => (
              <PersonRow key={p.id} p={p} net={summarize(p.id, pairs).net} isSelf={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
