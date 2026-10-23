"use client";

import { createElement, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, ArrowUUpLeft, CalendarBlank, CheckCircle, Lightning, Plus } from "@phosphor-icons/react/ssr";
import { deletePersonalExpense, savePersonalExpense } from "@/app/actions/personal";
import { money } from "@/lib/currency";
import { addDays } from "@/lib/time";
import { parseQuick, type History } from "@/lib/quick-add";
import type { Chip, PCategory } from "@/lib/personal";
import { ICONS } from "@/components/bits";

type Props = {
  categories: PCategory[];
  history: History;
  chips: Chip[];
  starters: string[];
  today: string;
  currency: string;
  autoFocus?: boolean;
};

type Done = { text: string; undoId?: string };

/**
 * One line to add spending: "lunch 450", "uber 1200 yesterday". As you type it shows what it
 * understood (amount, category, day), and each part can be tapped to change. Chips under it are
 * the things you add most at this time of day: one tap adds them.
 */
export function QuickAdd({ categories, history, chips, starters, today, currency, autoFocus }: Props) {
  const active = categories.filter((c) => !c.archived);
  const have = useMemo(() => new Set(active.map((c) => c.key)), [active]);
  const [line, setLine] = useState("");
  const [catPick, setCatPick] = useState<string | null>(null);
  const [datePick, setDatePick] = useState<string | null>(null);
  const [open, setOpen] = useState<"cat" | "date" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const p = parseQuick(line, today, history, have);
  const category = catPick ?? p.category ?? "other";
  const date = datePick ?? p.date;
  const cat = active.find((c) => c.key === category) ?? active.find((c) => c.key === "other");
  const dateLabel = datePick ? (datePick === today ? "Today" : datePick === addDays(today, -1) ? "Yesterday" : datePick) : (p.dateWord ?? "Today");

  const reset = () => {
    setLine("");
    setCatPick(null);
    setDatePick(null);
    setOpen(null);
  };

  const save = (entry: { amount: number; title: string; category: string; spent_on: string }) => {
    setError(null);
    const f = new FormData();
    f.set("amount", String(entry.amount));
    f.set("title", entry.title);
    f.set("category", entry.category);
    f.set("spent_on", entry.spent_on);
    f.set("source", "quick");
    start(async () => {
      const res = await savePersonalExpense(null, f);
      if (res?.error) setError(res.error);
      else {
        setDone({ text: `${entry.title} · ${money(entry.amount, currency)}`, undoId: res?.undoId });
        reset();
      }
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!p.amount) return setError("Add the amount too, like “lunch 450”");
    save({ amount: p.amount, title: p.title || cat?.label || "Spending", category, spent_on: date });
  };

  const undo = (id: string) => {
    const f = new FormData();
    f.set("id", id);
    start(async () => {
      await deletePersonalExpense(f);
      setDone(null);
    });
  };

  const chip = "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold transition";

  return (
    <section className="card space-y-3" aria-label="Quick add">
      <form onSubmit={submit} className="flex items-center gap-2">
        <label htmlFor="quick" className="sr-only">
          What did you spend on? Type it with the amount, like lunch 450
        </label>
        <input
          ref={input}
          id="quick"
          value={line}
          onChange={(e) => {
            setLine(e.target.value);
            setError(null);
            if (!e.target.value) reset();
          }}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="lunch 450 · uber 1200 yesterday"
          className="input min-h-12 flex-1 text-base"
        />
        <button
          type="submit"
          disabled={pending || !line.trim()}
          aria-label="Add"
          className="btn-primary size-12 shrink-0 justify-center rounded-2xl p-0 disabled:opacity-50"
        >
          <ArrowRight size={20} weight="bold" aria-hidden="true" />
        </button>
      </form>

      {line.trim() && (
        <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
          <span className={`${chip} ${p.amount ? "border-brand bg-brand-soft text-brand-strong" : "border-dashed border-line text-muted"}`}>
            {p.amount ? money(p.amount, currency) : "No amount yet"}
          </span>
          <button
            type="button"
            onClick={() => setOpen(open === "cat" ? null : "cat")}
            aria-expanded={open === "cat"}
            className={`${chip} border-line text-ink hover:bg-surface-2`}
          >
            {createElement((cat && ICONS[cat.icon]) || ICONS.receipt, { size: 13, "aria-hidden": true })} {cat?.label ?? "Other"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(open === "date" ? null : "date")}
            aria-expanded={open === "date"}
            className={`${chip} border-line text-ink hover:bg-surface-2`}
          >
            <CalendarBlank size={13} aria-hidden="true" /> {dateLabel}
          </button>
          {p.title && <span className="truncate text-xs text-muted">“{p.title}”</span>}
        </div>
      )}

      {open === "cat" && (
        <div className="flex flex-wrap gap-1.5">
          {active.map((c) => {
            const Icon = ICONS[c.icon] ?? ICONS.receipt;
            const on = c.key === category;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setCatPick(c.key);
                  setOpen(null);
                  input.current?.focus();
                }}
                className={`${chip} ${on ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-muted hover:text-ink"}`}
              >
                <Icon size={13} aria-hidden="true" /> {c.label}
              </button>
            );
          })}
        </div>
      )}

      {open === "date" && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { d: today, l: "Today" },
            { d: addDays(today, -1), l: "Yesterday" },
            { d: addDays(today, -2), l: "2 days ago" },
          ].map(({ d, l }) => (
            <button
              key={d}
              type="button"
              aria-pressed={date === d}
              onClick={() => {
                setDatePick(d);
                setOpen(null);
              }}
              className={`${chip} ${date === d ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-muted hover:text-ink"}`}
            >
              {l}
            </button>
          ))}
          <label className="sr-only" htmlFor="quick-date">Other day</label>
          <input
            id="quick-date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => e.target.value && setDatePick(e.target.value)}
            className="input w-auto py-1 text-xs"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {done && !error && (
        <p className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-strong" role="status">
          <CheckCircle size={16} weight="fill" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Added {done.text}</span>
          {done.undoId && (
            <button type="button" onClick={() => undo(done.undoId!)} disabled={pending} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
              <ArrowUUpLeft size={14} aria-hidden="true" /> Undo
            </button>
          )}
        </p>
      )}

      {!line && (chips.length > 0 || starters.length > 0) && (
        <>
        <p className="text-xs text-muted">{chips.length > 0 ? "Tap to add again for today" : "Tap one, then type the amount"}</p>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {chips.length > 0
            ? chips.map((c) => (
                <button
                  key={`${c.title}|${c.amount}`}
                  type="button"
                  disabled={pending}
                  onClick={() => save({ amount: c.amount, title: c.title, category: c.category, spent_on: today })}
                  className={`${chip} shrink-0 border-line bg-surface-2 text-ink hover:border-brand`}
                  aria-label={`Add ${c.title}, ${money(c.amount, currency)}, today`}
                >
                  <Lightning size={12} weight="fill" className="text-amber" aria-hidden="true" />
                  {c.title} <span className="text-muted tabular-nums">{money(c.amount, currency)}</span>
                </button>
              ))
            : starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setLine(`${s.toLowerCase()} `);
                    input.current?.focus();
                  }}
                  className={`${chip} shrink-0 border-dashed border-line text-muted hover:text-ink`}
                >
                  <Plus size={12} weight="bold" aria-hidden="true" />
                  {s}
                </button>
              ))}
        </div>
        </>
      )}
    </section>
  );
}
