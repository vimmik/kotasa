import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChatText } from "@phosphor-icons/react/ssr";
import { CategoryIcon, Money } from "@/components/bits";
import { fmtDay } from "@/lib/time";
import { PAID_PART, rs, type LedgerRow } from "@/lib/types";

/**
 * One item per thing that happened. The ledger has a line per person per expense ("Mahima's
 * share", "Mahesh's share"…), which reads like the same cake three times, so lines of one expense
 * (and its paid-part lines) are shown together with their total for `me`.
 */
type Item = { key: string; rows: LedgerRow[]; net: number };

function group(rows: LedgerRow[], me: string): Item[] {
  const items = new Map<string, Item>();
  for (const r of rows) {
    // Meal lines are one order each; only expenses have several lines under one id.
    const key = r.source === "expense" ? `expense-${r.ref_id}` : `${r.source}-${r.ref_id}-${r.debtor}-${r.creditor}`;
    const it = items.get(key) ?? { key, rows: [], net: 0 };
    it.rows.push(r);
    it.net += r.creditor === me ? r.amount : -r.amount;
    items.set(key, it);
  }
  return [...items.values()];
}

/** "Mahima", "Mahima & Mahesh", "Mahima, Mahesh & Vishwa", "Mahima, Mahesh & 3 others" */
function people(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
  return `${names.slice(0, 2).join(", ")} & ${names.length - 2} others`;
}

function describe(it: Item, me: string, name: (id: string) => string) {
  const row = it.rows[0];
  const iOwe = row.debtor === me;
  const other = name(iOwe ? row.creditor : row.debtor);
  const title = row.label.endsWith(PAID_PART) ? row.label.slice(0, -PAID_PART.length) : row.label;
  switch (row.source) {
    case "expense": {
      const owedToMe = it.rows.filter((r) => r.creditor === me && !r.label.endsWith(PAID_PART));
      const iOweRows = it.rows.filter((r) => r.debtor === me);
      if (it.rows.some((r) => r.label.endsWith(PAID_PART)))
        return { title, sub: it.net >= 0 ? "You paid part of the bill" : `${other} paid part of the bill` };
      if (owedToMe.length && !iOweRows.length)
        return { title, sub: `You paid · ${people(owedToMe.map((r) => name(r.debtor)))} ${owedToMe.length === 1 ? "owes" : "owe"} you` };
      return { title, sub: `${other} paid · your share` };
    }
    case "meal":
      if (row.label.endsWith(PAID_PART))
        return { title, sub: iOwe ? `${other} paid part of the bill` : `You paid part of the bill · owed by ${other}` };
      return { title, sub: iOwe ? `Meal · owed to ${other}` : `Meal · ${other} owes you` };
    case "sms":
      return { title: "Weekly SMS fee", sub: iOwe ? `Owed to ${other}` : `${other} owes you` };
    case "settlement":
      // stored reversed: debtor = receiver, creditor = payer
      return iOwe
        ? { title: `${other} paid you`, sub: row.label === "Payment" ? "Payment received" : row.label }
        : { title: `You paid ${other}`, sub: row.label === "Payment" ? "Payment sent" : row.label };
  }
}

function Icon({ row, me }: { row: LedgerRow; me: string }) {
  if (row.source === "meal") return <CategoryIcon icon="fork-knife" />;
  if (row.source === "sms")
    return (
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
        <ChatText size={18} aria-hidden="true" />
      </span>
    );
  if (row.source === "settlement") {
    const Arrow = row.creditor === me ? ArrowUpRight : ArrowDownLeft;
    return (
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
        <Arrow size={18} aria-hidden="true" />
      </span>
    );
  }
  return <CategoryIcon icon="receipt" />;
}

/**
 * What happened, from one person's point of view. Green = in your favour, red = you owe.
 * Payments are money that changed hands, not a gain or a loss, so they show plain.
 */
export function ActivityList({
  rows,
  me,
  names,
  icons = {},
  base,
  max,
}: {
  rows: LedgerRow[];
  me: string;
  names: Map<string, string>;
  /** expense id -> category icon name */
  icons?: Record<string, string>;
  /** group URL prefix; without it expense rows aren't links (public bill page) */
  base?: string;
  /** show at most this many items */
  max?: number;
}) {
  const name = (id: string) => names.get(id)?.split(" ")[0] ?? "Someone";
  const items = group(rows, me).slice(0, max);
  return (
    <ul className="divide-y divide-line">
      {items.map((it) => {
        const r = it.rows[0];
        const d = describe(it, me, name);
        const body = (
          <div className="flex items-center gap-3 py-3">
            {r.source === "expense" ? <CategoryIcon icon={icons[r.ref_id]} /> : <Icon row={r} me={me} />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{d.title}</p>
              <p className="truncate text-xs text-muted">
                {fmtDay(r.entry_date)} · {d.sub}
              </p>
            </div>
            {r.source === "settlement" ? (
              <span className="text-sm font-semibold tabular-nums">{rs(r.amount)}</span>
            ) : (
              <Money value={it.net} signed className="text-sm" />
            )}
          </div>
        );
        return (
          <li key={it.key}>
            {r.source === "expense" && base ? (
              <Link href={`${base}/expenses/${r.ref_id}`} className="-mx-2 block rounded-xl px-2 hover:bg-surface-2">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
