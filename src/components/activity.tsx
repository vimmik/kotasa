import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChatText } from "@phosphor-icons/react/ssr";
import { CategoryIcon, Money } from "@/components/bits";
import { fmtDay } from "@/lib/time";
import { PAID_PART, type LedgerRow } from "@/lib/types";

function describe(row: LedgerRow, me: string, name: (id: string) => string) {
  const iOwe = row.debtor === me;
  const other = name(iOwe ? row.creditor : row.debtor);
  // Co-payer rows: the main payer owes someone who paid part of the bill (see the ledger view).
  if ((row.source === "expense" || row.source === "meal") && row.label.endsWith(PAID_PART)) {
    const title = row.label.slice(0, -PAID_PART.length);
    return { title, sub: iOwe ? `${other} paid part of the bill` : `You paid part of the bill · owed by ${other}` };
  }
  switch (row.source) {
    case "expense":
      return { title: row.label, sub: iOwe ? `${other} paid · your share` : `You paid · ${other}'s share` };
    case "meal":
      return { title: row.label, sub: iOwe ? `Meal · owed to ${other}` : `Meal · ${other} owes you` };
    case "sms":
      return { title: "Weekly SMS fee", sub: iOwe ? `Owed to ${other}` : `${other} owes you` };
    case "settlement":
      // stored reversed: debtor = receiver, creditor = payer
      return iOwe
        ? { title: `${other} paid you`, sub: row.label }
        : { title: `You paid ${other}`, sub: row.label };
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
 * Ledger lines from one person's point of view. `me` decides the sign:
 * green = in your favour, red = you owe.
 */
export function ActivityList({
  rows,
  me,
  names,
  icons = {},
  base,
}: {
  rows: LedgerRow[];
  me: string;
  names: Map<string, string>;
  /** expense id -> category icon name */
  icons?: Record<string, string>;
  /** group URL prefix; without it expense rows aren't links (public bill page) */
  base?: string;
}) {
  const name = (id: string) => names.get(id)?.split(" ")[0] ?? "Someone";
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const d = describe(r, me, name);
        const signed = r.creditor === me ? r.amount : -r.amount;
        const body = (
          <div className="flex items-center gap-3 py-3">
            {r.source === "expense" ? <CategoryIcon icon={icons[r.ref_id]} /> : <Icon row={r} me={me} />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{d.title}</p>
              <p className="truncate text-xs text-muted">
                {fmtDay(r.entry_date)} · {d.sub}
              </p>
            </div>
            <Money value={signed} signed className="text-sm" />
          </div>
        );
        return (
          <li key={`${r.source}-${r.ref_id}-${r.debtor}-${r.creditor}`}>
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
