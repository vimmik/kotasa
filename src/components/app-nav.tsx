"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { ChartPieSlice, ForkKnife, House, Plus, Receipt, SlidersHorizontal, User } from "@phosphor-icons/react/ssr";

type Item = { href: string; label: string; Icon: PhosphorIcon };

export type NavConfig = { base: string; meals: boolean; budgets: boolean; admin: boolean };

function items({ base, meals, budgets }: NavConfig): Item[] {
  return [
    { href: base, label: "Home", Icon: House },
    { href: `${base}/expenses`, label: "Expenses", Icon: Receipt },
    ...(meals ? [{ href: `${base}/meals`, label: "Meals", Icon: ForkKnife }] : []),
    ...(budgets ? [{ href: `${base}/budgets`, label: "Budgets", Icon: ChartPieSlice }] : []),
    { href: `${base}/account`, label: "Account", Icon: User },
  ];
}

function isActive(path: string, href: string, base: string) {
  return href === base ? path === base : path === href || path.startsWith(href + "/");
}

/** Desktop: inline links in the header. */
export function TopNav({ config }: { config: NavConfig }) {
  const path = usePathname();
  const list = config.admin
    ? [...items(config), { href: `${config.base}/admin`, label: "Admin", Icon: SlidersHorizontal }]
    : items(config);
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
      {list.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(path, href, config.base) ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive(path, href, config.base) ? "bg-brand-soft text-brand-strong" : "text-muted hover:text-ink"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Mobile: fixed bottom tab bar with a centre "add expense" button. Four tabs at most. */
export function BottomNav({ config }: { config: NavConfig }) {
  const path = usePathname();
  const all = items(config);
  // Account lives behind the avatar in the header when all four module tabs are on.
  const tabs = all.length > 4 ? all.filter((i) => i.label !== "Account") : all;
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2, 4);
  const tab = ({ href, label, Icon }: Item) => {
    const active = isActive(path, href, config.base);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors duration-200 ${active ? "text-brand" : "text-muted active:text-ink"}`}
      >
        <span
          className={`absolute top-0 h-0.5 w-6 rounded-b-full bg-brand transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        />
        <Icon size={22} weight={active ? "fill" : "regular"} aria-hidden="true" />
        {label}
      </Link>
    );
  };
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-end">
        {left.map(tab)}
        <div className="flex flex-1 justify-center">
          <Link
            href={`${config.base}/expenses/new`}
            aria-label="Add expense"
            className="-mt-5 flex size-13 items-center justify-center rounded-2xl bg-brand text-brand-ink shadow-[var(--shadow-lift)] ring-4 ring-bg transition duration-200 active:scale-95"
          >
            <Plus size={26} weight="bold" aria-hidden="true" />
          </Link>
        </div>
        {right.map(tab)}
        {right.length < 2 && <span className="flex-1" aria-hidden="true" />}
      </div>
    </nav>
  );
}
