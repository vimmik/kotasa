"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminLink } from "@/lib/admin-links";

export function AdminNav({ links }: { links: AdminLink[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="no-print -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 ${active ? "bg-ink text-bg" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
