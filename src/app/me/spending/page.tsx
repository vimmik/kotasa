import Link from "next/link";
import type { Metadata } from "next";
import { CaretLeft, CaretRight, CheckCircle, Plus, X } from "@phosphor-icons/react/ssr";
import { money } from "@/lib/currency";
import { endOfMonth, startOfMonth } from "@/lib/periods";
import { getMe, getSpend } from "@/lib/personal";
import { addDays, todayColombo } from "@/lib/time";
import { EmptyState, ICONS, PageHeader } from "@/components/bits";
import { SpendList } from "@/components/me-bits";

export const metadata: Metadata = { title: "Spending" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function Spending(props: PageProps<"/me/spending">) {
  const sp = await props.searchParams;
  const { profile, currency, categories } = await getMe();
  const today = todayColombo();
  const m = typeof sp.m === "string" && MONTH.test(sp.m) ? sp.m : today.slice(0, 7);
  const filter = typeof sp.c === "string" && categories.some((c) => c.key === sp.c) ? sp.c : null;
  const start = `${m}-01`;
  const end = endOfMonth(start);
  const prev = startOfMonth(addDays(start, -1)).slice(0, 7);
  const next = addDays(end, 1).slice(0, 7);
  const monthName = new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const rows = await getSpend(profile.id, start, end);
  const counted = rows.filter((r) => r.counted);
  const foreign = rows.filter((r) => !r.counted);
  const total = counted.reduce((s, r) => s + r.amount, 0);
  const byCat = new Map<string, number>();
  for (const r of counted) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const fromGroups = counted.filter((r) => r.org_id).reduce((s, r) => s + r.amount, 0);
  const shown = filter ? counted.filter((r) => r.category === filter) : counted;
  const link = (q: { m?: string; c?: string | null }) => {
    const p = new URLSearchParams();
    const mm = q.m ?? m;
    if (mm !== today.slice(0, 7)) p.set("m", mm);
    const c = q.c === undefined ? filter : q.c;
    if (c) p.set("c", c);
    const s = p.toString();
    return `/me/spending${s ? `?${s}` : ""}`;
  };

  return (
    <div className="stagger space-y-6">
      {sp.saved === "1" && (
        <p className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-strong">
          <CheckCircle size={16} weight="fill" aria-hidden="true" /> Saved
        </p>
      )}
      <PageHeader
        title="Spending"
        sub="Your own entries and your share of everything in your groups"
        action={
          <Link href="/me/add" className="btn-primary">
            <Plus size={16} aria-hidden="true" /> Add
          </Link>
        }
      />

      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link href={link({ m: prev })} className="btn-ghost px-2.5" aria-label="Previous month">
            <CaretLeft size={16} aria-hidden="true" />
          </Link>
          <div className="text-center">
            <p className="text-sm text-muted">{monthName}</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{money(total, currency)}</p>
            {fromGroups > 0 && <p className="text-xs text-muted">{money(fromGroups, currency)} of it from your groups</p>}
          </div>
          {next <= today.slice(0, 7) ? (
            <Link href={link({ m: next })} className="btn-ghost px-2.5" aria-label="Next month">
              <CaretRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <span className="w-10" aria-hidden="true" />
          )}
        </div>

        {cats.length > 0 && (
          <ul className="space-y-2.5" aria-label="By category">
            {cats.map(([key, amt]) => {
              const c = categories.find((x) => x.key === key);
              const Icon = (c && ICONS[c.icon]) || ICONS.receipt;
              const on = filter === key;
              return (
                <li key={key}>
                  <Link
                    href={link({ c: on ? null : key })}
                    aria-current={on ? "true" : undefined}
                    className={`-mx-2 block rounded-xl px-2 py-1 transition hover:bg-surface-2 ${on ? "bg-brand-soft" : ""}`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Icon size={15} className="text-muted" aria-hidden="true" />
                      <span className="flex-1 font-medium">{c?.label ?? "Other"}</span>
                      <span className="text-xs text-muted tabular-nums">{Math.round((amt / total) * 100)}%</span>
                      <span className="w-24 text-right font-semibold tabular-nums">{money(amt, currency)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${(amt / cats[0][1]) * 100}%` }} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {filter && (
        <Link href={link({ c: null })} className="pill inline-flex items-center gap-1 bg-brand-soft text-brand-strong">
          {categories.find((c) => c.key === filter)?.label} <X size={12} aria-label="Clear filter" />
        </Link>
      )}

      {shown.length === 0 ? (
        <EmptyState title="Nothing here" body={`No spending in ${monthName}${filter ? " in this category" : ""}.`} />
      ) : (
        <SpendList rows={shown} categories={categories} currency={currency} byDay />
      )}

      {foreign.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium text-muted">Other currencies</h2>
          <p className="mb-2 text-xs text-muted">
            These groups use a different currency from yours ({currency}), so they aren&apos;t added to your totals.
          </p>
          <div className="card py-1">
            <SpendList rows={foreign} categories={categories} currency={currency} />
          </div>
        </section>
      )}
    </div>
  );
}
