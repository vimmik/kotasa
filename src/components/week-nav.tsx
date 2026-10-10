import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { addDays, fmtDay, fmtWeek, todayColombo, weekStart } from "@/lib/time";

/** base must end with "?" or "&", e.g. "/expenses?" */
export function WeekNav({ base, ws }: { base: string; ws: string }) {
  const thisWeek = weekStart(todayColombo());
  return (
    <div className="flex items-center gap-1">
      <Link href={`${base}week=${addDays(ws, -7)}`} className="btn-ghost size-9 min-h-0 p-0" aria-label="Previous week">
        <CaretLeft size={18} aria-hidden="true" />
      </Link>
      <span className="min-w-32 text-center text-sm font-semibold">{ws === thisWeek ? "This week" : fmtWeek(ws)}</span>
      <Link href={`${base}week=${addDays(ws, 7)}`} className="btn-ghost size-9 min-h-0 p-0" aria-label="Next week">
        <CaretRight size={18} aria-hidden="true" />
      </Link>
    </div>
  );
}

export function DateNav({ base, date }: { base: string; date: string }) {
  const today = todayColombo();
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Link href={`${base}?date=${addDays(date, -1)}`} className="btn-ghost size-10 p-0" aria-label="Previous day">
        <CaretLeft size={18} aria-hidden="true" />
      </Link>
      <form action={base} className="flex items-center gap-2">
        <input type="date" name="date" defaultValue={date} className="input w-auto" aria-label="Date" />
        <button className="btn-ghost">Go</button>
      </form>
      <Link href={`${base}?date=${addDays(date, 1)}`} className="btn-ghost size-10 p-0" aria-label="Next day">
        <CaretRight size={18} aria-hidden="true" />
      </Link>
      {date !== today ? (
        <Link href={`${base}?date=${today}`} className="text-sm font-semibold text-brand">Today</Link>
      ) : (
        <span className="pill bg-brand-soft text-brand-strong">Today</span>
      )}
      <span className="text-sm text-muted">{fmtDay(date)}</span>
    </div>
  );
}
