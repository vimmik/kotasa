import Link from "next/link";
import { ArrowRight, CheckCircle, Lightbulb, TrendDown, TrendUp, Warning } from "@phosphor-icons/react/ssr";
import { compact, type Tip, type Tone } from "@/lib/insights";

const TONE: Record<Tone, { wrap: string; Icon: typeof Warning; word: string }> = {
  warn: { wrap: "bg-amber-soft text-amber-ink", Icon: Warning, word: "Heads up" },
  good: { wrap: "bg-brand-soft text-brand-strong", Icon: CheckCircle, word: "Good news" },
  info: { wrap: "bg-info-soft text-info-ink", Icon: Lightbulb, word: "Tip" },
};

/** Findings in plain words. A tip with somewhere to go is one big tap target. */
export function TipList({ tips, max = 4 }: { tips: Tip[]; max?: number }) {
  if (!tips.length) return null;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {tips.slice(0, max).map((t) => {
        const { wrap, Icon, word } = TONE[t.tone];
        const body = (
          <>
            <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${wrap}`}>
              <Icon size={18} weight="duotone" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="sr-only">{word}: </span>
              <span className="block font-semibold">{t.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{t.body}</span>
              {t.href && t.cta && (
                <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                  {t.cta} <ArrowRight size={14} aria-hidden="true" />
                </span>
              )}
            </span>
          </>
        );
        return (
          <li key={t.id} className="flex">
            {t.href ? (
              <Link href={t.href} className="card-link flex w-full items-start gap-3">
                {body}
              </Link>
            ) : (
              <div className="card flex w-full items-start gap-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "12% more than usual": the number in a small pill with an arrow. Spending going up is the
 * amber one. Nothing when there is no usual to compare with; "about the same" within 5%.
 */
export function Delta({ now, usual }: { now: number; usual: number | null }) {
  if (!usual || usual <= 0) return null;
  const p = Math.round(((now - usual) / usual) * 100);
  if (Math.abs(p) < 5) return <span className="text-[11px] leading-tight text-muted">About the same as usual</span>;
  const up = p > 0;
  const Icon = up ? TrendUp : TrendDown;
  // The number sits in the pill and the words follow it, so a narrow column wraps between the two.
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className={`pill whitespace-nowrap ${up ? "bg-amber-soft text-amber-ink" : "bg-brand-soft text-brand-strong"}`}>
        <Icon size={12} weight="bold" aria-hidden="true" />
        {Math.abs(p)}%
      </span>
      <span className="text-[11px] leading-tight text-muted">{up ? "more" : "less"} than usual</span>
    </span>
  );
}

export type Column = {
  key: string;
  /** under the column: "Nov", "Mon" */
  label: string;
  value: number;
  /** the part of `value` drawn in the brand colour (your share); the rest is drawn grey above it */
  part?: number;
  /** read out and shown on hover: "November: Rs. 12,400, your share Rs. 3,100" */
  title: string;
  href?: string;
  /** the one being looked at */
  selected?: boolean;
};

const PLOT = 104; // px a full-height column gets

/**
 * A row of thin columns on one baseline: months of spending, or days of the week. The selected
 * column is at full strength and the others stand back. Every column carries its value in words
 * for screen readers, so the chart is also its own table.
 */
export function Columns({ items, label, dense = false }: { items: Column[]; label: string; dense?: boolean }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  const anySelected = items.some((i) => i.selected);
  return (
    <ol className="flex items-end" aria-label={label}>
      {items.map((i) => {
        const h = max > 0 && i.value > 0 ? Math.max(3, Math.round((i.value / max) * PLOT)) : 0;
        const part = i.part === undefined ? i.value : Math.min(i.part, i.value);
        const rest = i.value - part;
        const strong = i.selected || !anySelected;
        const body = (
          <>
            <span className="sr-only">{i.title}</span>
            <span
              aria-hidden="true"
              className={`text-[10px] leading-none tabular-nums ${i.selected ? "font-semibold text-ink" : "text-muted"} ${dense && !i.selected ? "hidden sm:block" : ""}`}
            >
              {i.value > 0 ? compact(i.value) : ""}
            </span>
            <span
              aria-hidden="true"
              className={`flex w-full max-w-7 flex-col-reverse gap-0.5 px-0.5 transition-opacity duration-200 group-hover:opacity-100 ${strong ? "" : "opacity-60"}`}
              style={{ height: h }}
            >
              {part > 0 && (
                <span className={`min-h-0.5 bg-brand ${rest > 0 ? "" : "rounded-t-[4px]"}`} style={{ flexGrow: part, flexBasis: 0 }} />
              )}
              {rest > 0 && <span className="min-h-0.5 rounded-t-[4px] bg-muted/40" style={{ flexGrow: rest, flexBasis: 0 }} />}
            </span>
            <span aria-hidden="true" className="h-px w-full bg-line" />
            <span aria-hidden="true" className={`text-[11px] leading-none ${i.selected ? "font-semibold text-ink" : "text-muted"}`}>
              {i.label}
            </span>
          </>
        );
        const cls = "group flex w-full flex-col items-center justify-end gap-1.5 rounded-lg pt-1 pb-0.5";
        return (
          <li key={i.key} className="flex min-w-0 flex-1" style={{ minHeight: PLOT + 44 }} title={i.title}>
            {i.href ? (
              <Link href={i.href} aria-current={i.selected ? "true" : undefined} className={`${cls} hover:bg-surface-2`}>
                {body}
              </Link>
            ) : (
              <span className={cls}>{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The two-swatch key for charts that split "your share" from the rest. */
export function ShareLegend({ part = "Your share", rest = "Everyone else" }: { part?: string; rest?: string }) {
  return (
    <p className="flex items-center gap-3 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-brand" aria-hidden="true" /> {part}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-muted/40" aria-hidden="true" /> {rest}
      </span>
    </p>
  );
}

/** Two or three choices in a row, as links (the choice lives in the URL). */
export function Segmented({ options, label }: { options: { href: string; label: string; on: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1 text-sm">
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          aria-current={o.on ? "true" : undefined}
          className={`rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition-colors duration-200 ${o.on ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
