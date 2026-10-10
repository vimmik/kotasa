import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Moped, Car, Gift, Receipt, ShoppingBag, ForkKnife, Lightning } from "@phosphor-icons/react/ssr";
import { rs } from "@/lib/types";

const AVATAR_TONES = [
  "bg-brand-soft text-brand-strong",
  "bg-amber-soft text-amber-ink",
  "bg-info-soft text-info-ink",
  "bg-danger-soft text-danger",
];

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const tone = AVATAR_TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[32%] font-semibold ${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}

/** + green (owed to you), − red (you owe), 0 muted */
export function Money({ value, signed = false, className = "" }: { value: number; signed?: boolean; className?: string }) {
  const tone = value > 0.004 ? "text-brand" : value < -0.004 ? "text-danger" : "text-muted";
  return (
    <span className={`font-semibold tabular-nums ${signed ? tone : ""} ${className}`}>
      {signed && value > 0.004 ? "+" : ""}
      {signed && value < -0.004 ? "−" : ""}
      {rs(Math.abs(value))}
    </span>
  );
}

export const CATEGORY_ICON: Record<string, PhosphorIcon> = {
  food: ForkKnife,
  ride: Car,
  shopping: ShoppingBag,
  bills: Lightning,
  fun: Gift,
  other: Receipt,
  meal: ForkKnife,
  delivery: Moped,
};

export function CategoryIcon({ category, size = 18 }: { category: string; size?: number }) {
  const Icon = CATEGORY_ICON[category] ?? Receipt;
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon: Icon = Receipt,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon?: PhosphorIcon;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      <span className="mb-1 inline-flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
        <Icon size={22} weight="duotone" aria-hidden="true" />
      </span>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Loading() {
  return (
    <div className="animate-pulse space-y-3 py-4" aria-busy="true">
      <div className="h-7 w-48 rounded-lg bg-surface-2" />
      <div className="h-32 rounded-2xl bg-surface-2" />
      <div className="h-24 rounded-2xl bg-surface-2" />
    </div>
  );
}
