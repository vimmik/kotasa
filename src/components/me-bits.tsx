import Link from "next/link";
import { UsersThree } from "@phosphor-icons/react/ssr";
import { money } from "@/lib/currency";
import { fmtDay } from "@/lib/time";
import type { PCategory, SpendRow } from "@/lib/personal";
import { ICONS } from "@/components/bits";

/** Progress of one budget. Green, amber from 80%, red when over. */
export function MeBar({ spent, limit, currency, label = "Budget used" }: { spent: number; limit: number; currency: string; label?: string }) {
  const pct = limit > 0 ? Math.min(100, Math.max(0, (spent / limit) * 100)) : 100;
  const over = spent > limit;
  const tone = over ? "bg-danger" : pct >= 80 ? "bg-amber" : "bg-brand";
  return (
    <div className="space-y-1.5">
      <div
        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, limit)}
        aria-valuenow={spent}
        aria-label={label}
      >
        <div className={`h-full rounded-full ${tone} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted tabular-nums">
          {money(spent, currency)} of {money(limit, currency)}
        </span>
        <span className={`font-semibold tabular-nums ${over ? "text-danger" : "text-ink"}`}>
          {over ? `${money(spent - limit, currency)} over` : `${money(limit - spent, currency)} left`}
        </span>
      </div>
    </div>
  );
}

export function CatIcon({ icon, size = 18 }: { icon?: string | null; size?: number }) {
  const Icon = (icon && ICONS[icon]) || ICONS.receipt;
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}

/** Where a row opens: your own entries open for editing; group shares open in their group. */
export function rowHref(r: SpendRow) {
  if (r.source === "manual") return `/me/spending/${r.ref_id}`;
  if (!r.org_slug) return null;
  if (r.source === "expense") return `/g/${r.org_slug}/expenses/${r.ref_id}`;
  if (r.source === "meal") return `/g/${r.org_slug}/meals`;
  return `/g/${r.org_slug}/account`;
}

/** Spending rows, grouped by day when `byDay`. Group shares carry the group's name. */
export function SpendList({
  rows,
  categories,
  currency,
  byDay = false,
}: {
  rows: SpendRow[];
  categories: PCategory[];
  currency: string;
  byDay?: boolean;
}) {
  const cats = new Map(categories.map((c) => [c.key, c]));
  const item = (r: SpendRow) => {
    const href = rowHref(r);
    const body = (
      <>
        <CatIcon icon={cats.get(r.category)?.icon} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{r.title}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
            {cats.get(r.category)?.label ?? "Other"}
            {r.org_name && (
              <span className="pill inline-flex max-w-40 items-center gap-1 truncate whitespace-nowrap bg-info-soft text-info-ink">
                <UsersThree size={11} aria-hidden="true" /> {r.org_name}
              </span>
            )}
            {!byDay && <span className="whitespace-nowrap">· {fmtDay(r.spent_on)}</span>}
          </span>
        </span>
        <span className={`font-semibold tabular-nums ${r.counted ? "" : "text-muted"}`}>{money(r.amount, r.currency)}</span>
      </>
    );
    return (
      <li key={`${r.source}-${r.ref_id}`}>
        {href ? (
          <Link href={href} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-2">
            {body}
          </Link>
        ) : (
          <div className="flex items-center gap-3 py-2.5">{body}</div>
        )}
      </li>
    );
  };

  if (!byDay) return <ul className="divide-y divide-line">{rows.map(item)}</ul>;

  const days = new Map<string, SpendRow[]>();
  for (const r of rows) days.set(r.spent_on, [...(days.get(r.spent_on) ?? []), r]);
  return (
    <div className="space-y-4">
      {[...days.entries()].map(([day, list]) => {
        const total = list.reduce((s, r) => (r.counted ? s + r.amount : s), 0);
        return (
          <section key={day}>
            <div className="mb-1 flex items-baseline justify-between px-1 text-xs font-medium text-muted">
              <h3>{fmtDay(day)}</h3>
              <span className="tabular-nums">{money(total, currency)}</span>
            </div>
            <ul className="card divide-y divide-line py-1">{list.map(item)}</ul>
          </section>
        );
      })}
    </div>
  );
}
