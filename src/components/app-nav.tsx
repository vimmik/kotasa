"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ChartPieSlice, Plus, Receipt, SlidersHorizontal, User, ForkKnife } from "@phosphor-icons/react/ssr";

const ITEMS = [
  { href: "/", label: "Home", Icon: House },
  { href: "/expenses", label: "Expenses", Icon: Receipt },
  { href: "/meals", label: "Meals", Icon: ForkKnife },
  { href: "/budgets", label: "Budgets", Icon: ChartPieSlice },
  { href: "/account", label: "Account", Icon: User },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

/** Desktop: inline links in the header. */
export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const items = isAdmin ? [...ITEMS, { href: "/admin", label: "Admin", Icon: SlidersHorizontal }] : ITEMS;
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
      {items.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(path, href) ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive(path, href) ? "bg-brand-soft text-brand-strong" : "text-muted hover:text-ink"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Mobile: fixed bottom tab bar with a centre "add expense" button. */
export function BottomNav() {
  const path = usePathname();
  const left = ITEMS.slice(0, 2);
  const right = ITEMS.slice(2, 4);
  const tab = ({ href, label, Icon }: (typeof ITEMS)[number]) => {
    const active = isActive(path, href);
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
            href="/expenses/new"
            aria-label="Add expense"
            className="-mt-5 flex size-13 items-center justify-center rounded-2xl bg-brand text-brand-ink shadow-[var(--shadow-lift)] ring-4 ring-bg transition duration-200 active:scale-95"
          >
            <Plus size={26} weight="bold" aria-hidden="true" />
          </Link>
        </div>
        {right.map(tab)}
      </div>
    </nav>
  );
}
