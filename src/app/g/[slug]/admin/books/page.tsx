import { requirePermission } from "@/lib/auth";
import { getClosingBalances, getClosings } from "@/lib/closing";
import { listMembers } from "@/lib/ledger";
import { addDays, fmtDay, todayColombo } from "@/lib/time";
import { rs } from "@/lib/types";
import { AutoCloseForm, CloseBooksForm, ReopenForm } from "@/components/books-forms";

export default async function BooksPage(props: PageProps<"/g/[slug]/admin/books">) {
  const { slug } = await props.params;
  const ctx = await requirePermission(slug, "books.close");
  const [closings, people] = await Promise.all([getClosings(ctx.org.id), listMembers(ctx.org.id, { includeInactive: true })]);
  const latest = closings[0];
  const frozen = latest ? await getClosingBalances(ctx.org.id, latest.id) : [];
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const today = todayColombo();
  const isOwner = ctx.member.role_key === "owner";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Close books</h1>
        <p className="text-sm text-muted">
          {latest
            ? `Closed up to ${fmtDay(latest.closed_through)}. Balances from then are fixed; only newer activity changes them.`
            : "Nothing is closed yet. Every balance is worked out again whenever something changes."}
        </p>
      </div>

      {(!latest || latest.closed_through < today) && (
        <CloseBooksForm today={today} min={latest ? addDays(latest.closed_through, 1) : null} defaultDate={today} />
      )}
      {ctx.settings.auto_close !== undefined && <AutoCloseForm on={ctx.settings.auto_close} />}

      {latest && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Frozen on {fmtDay(latest.closed_through)}</h2>
              <p className="text-sm text-muted">
                {frozen.length ? `${frozen.length} balances, ${rs(frozen.reduce((s, b) => s + b.amount, 0))} in all.` : "Everyone was settled."}
                {latest.note && ` ${latest.note}.`}
              </p>
            </div>
            {isOwner && <ReopenForm id={latest.id} label={`the close up to ${fmtDay(latest.closed_through)}`} />}
          </div>
          {frozen.length > 0 && (
            <ul className="divide-y divide-line">
              {frozen
                .sort((a, b) => b.amount - a.amount)
                .map((b) => (
                  <li key={`${b.debtor}-${b.creditor}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      {names.get(b.debtor) ?? "?"} owed {names.get(b.creditor) ?? "?"}
                    </span>
                    <span className="font-medium tabular-nums">{rs(b.amount)}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {closings.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Earlier closes</h2>
          <ul className="card divide-y divide-line py-1">
            {closings.slice(1).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="font-medium">Up to {fmtDay(c.closed_through)}</span>
                <span className="text-muted">
                  {[c.note, c.closed_by ? names.get(c.closed_by) : "Automatic"].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
