// Budget periods for Me. Pure date math on "YYYY-MM-DD" strings (see lib/time.ts), so it runs
// the same on the server and in the browser.
import { addDays, weekStart } from "@/lib/time";

export type Period = "day" | "week" | "month" | "year" | "payday" | "custom";
export type Range = { start: string; end: string };

export const PERIODS: { id: Period; label: string; every: string }[] = [
  { id: "day", label: "Daily", every: "a day" },
  { id: "week", label: "Weekly", every: "a week" },
  { id: "month", label: "Monthly", every: "a month" },
  { id: "payday", label: "Payday to payday", every: "per pay cycle" },
  { id: "year", label: "Yearly", every: "a year" },
  { id: "custom", label: "Custom dates", every: "for these dates" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (d: string) => d.split("-").map(Number) as [number, number, number];

/** First day of the month n months after (y, m). m is 1-12. */
function monthStart(y: number, m: number, n = 0) {
  const i = y * 12 + (m - 1) + n;
  return ymd(Math.floor(i / 12), (i % 12) + 1, 1);
}

export function startOfMonth(d: string) {
  const [y, m] = parts(d);
  return monthStart(y, m);
}

export function endOfMonth(d: string) {
  const [y, m] = parts(d);
  return addDays(monthStart(y, m, 1), -1);
}

/** Same day-of-month n months later. Only used with days 1-28, so it never overflows. */
function shiftMonths(d: string, n: number) {
  const [y, m, day] = parts(d);
  return monthStart(y, m, n).slice(0, 8) + pad(day);
}

export type PeriodOpts = { payday?: number | null; startsOn?: string; endsOn?: string | null };

/** The period of this kind that contains `date`. */
export function periodRange(period: Period, date: string, opts: PeriodOpts = {}): Range {
  const [y, m, day] = parts(date);
  switch (period) {
    case "day":
      return { start: date, end: date };
    case "week": {
      const start = weekStart(date);
      return { start, end: addDays(start, 6) };
    }
    case "month":
      return { start: startOfMonth(date), end: endOfMonth(date) };
    case "year":
      return { start: ymd(y, 1, 1), end: ymd(y, 12, 31) };
    case "payday": {
      const p = Math.min(28, Math.max(1, opts.payday ?? 1));
      const start = day >= p ? ymd(y, m, p) : shiftMonths(ymd(y, m, p), -1);
      return { start, end: addDays(shiftMonths(start, 1), -1) };
    }
    case "custom":
      return { start: opts.startsOn ?? date, end: opts.endsOn ?? date };
  }
}

/** Days from a to b, both included. */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
}

/**
 * Every closed period from the one containing `from` up to (not including) the one containing
 * `today`. Used to add up rollover. Custom budgets have a single period, so none.
 */
export function closedPeriods(period: Period, from: string, today: string, opts: PeriodOpts = {}): Range[] {
  if (period === "custom") return [];
  const current = periodRange(period, today, opts);
  const out: Range[] = [];
  let r = periodRange(period, from, opts);
  // A daily budget started years ago is still only a few thousand ranges; cap it to stay safe.
  while (r.end < current.start && out.length < 4000) {
    out.push(r);
    r = periodRange(period, addDays(r.end, 1), opts);
  }
  return out;
}

/** "This week", "October", "25 Sep - 24 Oct"… */
export function rangeLabel(period: Period, r: Range) {
  const o = (d: string, f: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { ...f, timeZone: "UTC" });
  if (period === "day") return o(r.start, { weekday: "long", day: "numeric", month: "short" });
  if (period === "month") return o(r.start, { month: "long", year: "numeric" });
  if (period === "year") return r.start.slice(0, 4);
  return `${o(r.start, { day: "numeric", month: "short" })} - ${o(r.end, { day: "numeric", month: "short" })}`;
}

/**
 * Suggested main budget for a period from take-home pay (rule 10): income minus monthly bills and
 * what goals need, rounded down. Bills and goals arrive in phase B, so for now it's the income.
 */
export function suggestBudget(monthlyIncome: number | null, period: Period): number | null {
  if (!monthlyIncome || monthlyIncome <= 0) return null;
  const perMonth = monthlyIncome;
  const raw =
    period === "day" ? perMonth / 30 : period === "week" ? (perMonth * 12) / 52 : period === "year" ? perMonth * 12 : perMonth;
  const step = raw >= 100_000 ? 5000 : raw >= 10_000 ? 1000 : raw >= 1000 ? 100 : 10;
  return Math.max(step, Math.floor(raw / step) * step);
}
