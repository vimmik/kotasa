"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CaretDown, Check, Plus, Wallet } from "@phosphor-icons/react/ssr";

export type GroupLink = { slug: string; name: string; pending: boolean };

/**
 * Header dropdown: where you are (a group's name, or "Me"), and a jump to Me or any group you're in.
 * `current` is the group slug, or null on Me.
 */
export function GroupSwitcher({ current, groups }: { current: string | null; groups: GroupLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const here = groups.find((g) => g.slug === current);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex max-w-[11rem] items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink sm:max-w-[16rem]"
      >
        <span className="truncate">{current === null ? "Me" : (here?.name ?? "Groups")}</span>
        <CaretDown size={12} weight="bold" aria-hidden="true" className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 z-40 mt-2 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lift)]"
        >
          <Link
            role="menuitem"
            href="/me"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm hover:bg-surface-2"
          >
            <Wallet size={16} weight="duotone" className="text-brand" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium">Me · your own money</span>
            {current === null && <Check size={14} weight="bold" className="text-brand" aria-label="You're here" />}
          </Link>
          <div className="my-1 h-px bg-line" />
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Your groups</p>
          {groups.map((g) => (
            <Link
              key={g.slug}
              role="menuitem"
              href={g.pending ? "/groups" : `/g/${g.slug}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
              {g.pending && <span className="pill bg-amber-soft text-amber-ink">Waiting</span>}
              {g.slug === current && <Check size={14} weight="bold" className="text-brand" aria-label="Current group" />}
            </Link>
          ))}
          <div className="my-1 h-px bg-line" />
          <Link
            role="menuitem"
            href="/groups"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-brand hover:bg-surface-2"
          >
            <Plus size={14} weight="bold" aria-hidden="true" /> New group or see all
          </Link>
        </div>
      )}
    </div>
  );
}
