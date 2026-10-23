import Link from "next/link";
import { getAcrossGroups, type AcrossPerson } from "@/lib/across";
import { money } from "@/lib/currency";
import { Avatar } from "@/components/bits";

/** Everyone you owe or who owes you, added up across all your groups. */
export async function AcrossGroups({ profileId }: { profileId: string }) {
  const people = await getAcrossGroups(profileId);
  if (people.length === 0) return null;

  const currencies = [...new Set(people.map((p) => p.currency))];
  const totals = currencies.map((c) => {
    const mine = people.filter((p) => p.currency === c);
    return {
      currency: c,
      owe: mine.reduce((s, p) => s + (p.net < 0 ? -p.net : 0), 0),
      owed: mine.reduce((s, p) => s + (p.net > 0 ? p.net : 0), 0),
    };
  });

  return (
    <section className="space-y-2">
      <div>
        <h2 className="font-semibold">Across all your groups</h2>
        <p className="text-xs text-muted">
          Each person&apos;s balance from every group you share, added up. Payments are still recorded inside each group.
        </p>
      </div>

      <div className="card grid grid-cols-2 p-0 text-sm">
        <div className="border-r border-line px-5 py-4">
          <p className="text-xs text-muted">You owe</p>
          {totals.map((t) => (
            <p key={t.currency} className={`mt-0.5 font-semibold tabular-nums ${t.owe > 0.004 ? "text-danger" : "text-muted"}`}>
              {money(t.owe, t.currency)}
            </p>
          ))}
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-muted">Owed to you</p>
          {totals.map((t) => (
            <p key={t.currency} className={`mt-0.5 font-semibold tabular-nums ${t.owed > 0.004 ? "text-brand" : "text-muted"}`}>
              {money(t.owed, t.currency)}
            </p>
          ))}
        </div>
      </div>

      <ul className="card divide-y divide-line py-1">
        {people.map((p) => (
          <PersonRow key={p.key} p={p} />
        ))}
      </ul>
    </section>
  );
}

function PersonRow({ p }: { p: AcrossPerson }) {
  const even = Math.abs(p.net) < 0.005;
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <Avatar name={p.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.name}</span>
          <span className="text-xs text-muted">
            {even ? "Evens out" : p.net > 0 ? "Owes you" : "You owe"}
            {p.lines.length > 1 ? ` · ${p.lines.length} groups` : ""}
          </span>
        </span>
        <span className={`font-semibold tabular-nums ${even ? "text-muted" : p.net > 0 ? "text-brand" : "text-danger"}`}>
          {money(Math.abs(p.net), p.currency)}
        </span>
      </div>
      <ul className="mt-2 space-y-1 pl-12">
        {p.lines.map((l) => (
          <li key={`${l.org.id}-${l.memberId}`} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-muted">{l.org.name}</span>
            <span className={`tabular-nums ${l.amount > 0 ? "text-brand" : "text-danger"}`}>
              {l.amount > 0 ? "+" : "−"}
              {money(Math.abs(l.amount), p.currency)}
            </span>
            {l.canSettle && (
              <Link
                href={`/g/${l.org.slug}/settle?${l.amount < 0 ? "to" : "from"}=${l.memberId}&amount=${Math.abs(l.amount)}`}
                className="btn-ghost px-3 py-1 text-xs"
              >
                {l.amount < 0 ? "Settle" : "Got paid"}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}
