// All dates are "YYYY-MM-DD" strings in Sri Lanka time (Asia/Colombo).
export const TZ = "Asia/Colombo";

function partsNow() {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

export function todayColombo(): string {
  return partsNow().date;
}

export function nowColombo() {
  return partsNow();
}

function toUTC(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUTC(dt: Date) {
  return dt.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const dt = toUTC(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

/** 1 = Monday ... 7 = Sunday */
export function isoWeekday(d: string): number {
  const w = toUTC(d).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Monday of the week containing d */
export function weekStart(d: string): string {
  return addDays(d, 1 - isoWeekday(d));
}

export function isValidDate(d: string | undefined | null): d is string {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(toUTC(d).getTime());
}

export function fmtDay(d: string) {
  return toUTC(d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function fmtWeek(ws: string) {
  const s = toUTC(ws);
  const e = toUTC(addDays(ws, 6));
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  return `${s.toLocaleDateString("en-GB", o)} - ${e.toLocaleDateString("en-GB", o)}`;
}

/** Has the cutoff ("HH:MM[:SS]") for this date already passed in Colombo? */
export function isPastCutoff(date: string, cutoff: string): boolean {
  const now = partsNow();
  if (date < now.date) return true;
  if (date > now.date) return false;
  const [h, m] = cutoff.split(":").map(Number);
  return now.hour * 60 + now.minute >= h * 60 + m;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
