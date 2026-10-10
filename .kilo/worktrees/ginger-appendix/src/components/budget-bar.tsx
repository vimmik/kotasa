import { rs } from "@/lib/types";

export function BudgetBar({ spent, limit }: { spent: number; limit: number | null }) {
  if (!limit) return <p className="text-sm text-muted">{rs(spent)} spent · no limit</p>;
  const pct = Math.min(100, (spent / limit) * 100);
  const over = spent > limit;
  const tone = over ? "bg-danger" : pct >= 80 ? "bg-amber" : "bg-brand";
  return (
    <div className="space-y-1.5">
      <div
        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={spent}
        aria-label="Budget used"
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted">
          {rs(spent)} of {rs(limit)}
        </span>
        <span className={`font-semibold ${over ? "text-danger" : "text-ink"}`}>
          {over ? `${rs(spent - limit)} over` : `${rs(limit - spent)} left`}
        </span>
      </div>
    </div>
  );
}
