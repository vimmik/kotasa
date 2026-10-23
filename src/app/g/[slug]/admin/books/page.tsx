import { CheckCircle, LockSimple } from "@phosphor-icons/react/ssr";
import { requirePermission } from "@/lib/auth";
import { getClosingBalances, getClosings } from "@/lib/closing";
import { getPairs, listMembers } from "@/lib/ledger";
import { orgDb } from "@/lib/org-db";
import { addDays, fmtDay, isValidDate, todayColombo } from "@/lib/time";
import { rs } from "@/lib/types";
import { AutoCloseForm, CloseBooksForm, ReopenForm } from "@/components/books-forms";

type Balance = { debtor: string; creditor: string; amount: number };

export default async function BooksPage(props: PageProps<"/g/[slug]/admin/books">) {
  const { slug } = await props.params;
  const ctx = await requirePermission(slug, "books.close");
  const sp = await props.searchParams;
  const [closings, people] = await Promise.all([getClosings(ctx.org.id), listMembers(ctx.org.id, { includeInactive: true })]);
  const latest = closings[0];
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const today = todayColombo();
  const yesterday = addDays(today, -1);
  const isOwner = ctx.member.role_key === "owner";

  // Closing runs up to yesterday at most, so today's orders and payments always stay open.
  const min = latest ? addDays(latest.closed_through, 1) : null;
  const canClose = !min || min <= yesterday;
  const asked = typeof sp.through === "string" && isValidDate(sp.through) ? sp.through : yesterday;
  const through = asked > yesterday ? yesterday : min && asked < min ? min : asked;

  const db = orgDb(ctx.org.id);
  // How many entries this close would lock (those after the last close, up to the date).
  const countIn = (table: "expenses" | "settlements" | "orders", col: string) => {
    let q = db.select(table, "id", { count: "exact", head: true }).lte(col, through);
    if (latest) q = q.gt(col, latest.closed_through);
    return q;
  };
  const [frozen, preview, { count: nExpenses }, { count: nPayments }, { count: nOrders }] = await Promise.all([
    latest ? getClosingBalances(ctx.org.id, latest.id) : Promise.resolve([] as Balance[]),
    canClose ? getPairs(ctx.org.id, { until: through }) : Promise.resolve([] as Balance[]),
    countIn("expenses", "expense_date"),
    countIn("settlements", "paid_on"),
    ctx.settings.meals_enabled ? countIn("orders", "order_date") : Promise.resolve({ count: 0 }),
  ]);
  const entries = [
    nExpenses ? `${nExpenses} expense${nExpenses === 1 ? "" : "s"}` : null,
    nOrders ? `${nOrders} meal order${nOrders === 1 ? "" : "s"}` : null,
    nPayments ? `${nPayments} payment${nPayments === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Close books</h1>
        <p className="text-sm text-muted">
          Lock a finished week so nobody changes old entries and the amounts people were told stay the same.
        </p>
      </div>

      <section className="card space-y-3">
        <div className="flex items-start gap-3">
          <span
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${latest ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-muted"}`}
          >
            <LockSimple size={18} weight="duotone" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{latest ? `Closed up to ${fmtDay(latest.closed_through)}` : "Nothing is closed yet"}</p>
            <p className="text-sm text-muted">
              {latest
                ? "Entries on or before that day are locked. Everything after it works as usual."
                : "Every balance is worked out again from the full history whenever something changes."}
            </p>
          </div>
        </div>
        <ul className="space-y-1.5 border-t border-line pt-3 text-sm">
          {[
            "Everyone's balance up to the date you pick is saved exactly as it is.",
            "Expenses, meal orders and payments on or before that date can't be added, edited or deleted.",
            "Payments after it pay those saved amounts off. A saved amount between two people only changes when one of them pays, gets paid or is owed something new.",
            "Today is never closed, so people can keep ordering and recording payments.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      {canClose ? (
        <CloseBooksForm
          min={min}
          max={yesterday}
          value={through}
          summary={`${fmtDay(through)}: ${entries.length ? `${entries.join(", ")} will be locked.` : "no new entries to lock."}`}
        >
          {preview.length === 0 ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Everyone is settled up to this date.</p>
          ) : (
            <div className="rounded-xl border border-line">
              <p className="border-b border-line px-3 py-2 text-xs font-medium text-muted">
                Balances that will be saved ({preview.length}, {rs(preview.reduce((s, b) => s + b.amount, 0))} in all)
              </p>
              <BalanceList rows={preview} names={names} verb="owes" />
            </div>
          )}
        </CloseBooksForm>
      ) : (
        <p className="card text-sm text-muted">Already closed up to yesterday. You can close again tomorrow.</p>
      )}

      {ctx.settings.auto_close !== undefined && <AutoCloseForm on={ctx.settings.auto_close} />}

      {latest && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Saved on {fmtDay(latest.closed_through)}</h2>
              <p className="text-sm text-muted">
                {frozen.length ? `${frozen.length} balances, ${rs(frozen.reduce((s, b) => s + b.amount, 0))} in all.` : "Everyone was settled."}
                {latest.note && ` ${latest.note}.`}
                {" "}
                {latest.closed_by ? `Closed by ${names.get(latest.closed_by) ?? "someone"}.` : "Closed automatically."}
              </p>
            </div>
            {isOwner ? (
              <ReopenForm id={latest.id} label={`the close up to ${fmtDay(latest.closed_through)}`} />
            ) : (
              <p className="text-xs text-muted">Only an owner can reopen it.</p>
            )}
          </div>
          {frozen.length > 0 && <BalanceList rows={[...frozen]} names={names} verb="owed" />}
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

function BalanceList({ rows, names, verb }: { rows: Balance[]; names: Map<string, string>; verb: string }) {
  return (
    <ul className="divide-y divide-line px-3">
      {rows
        .sort((a, b) => b.amount - a.amount)
        .map((b) => (
          <li key={`${b.debtor}-${b.creditor}`} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              {names.get(b.debtor) ?? "?"} {verb} {names.get(b.creditor) ?? "?"}
            </span>
            <span className="font-medium tabular-nums">{rs(b.amount)}</span>
          </li>
        ))}
    </ul>
  );
}
