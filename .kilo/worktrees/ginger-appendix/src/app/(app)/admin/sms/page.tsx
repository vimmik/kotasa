import { getSettings, requireAdmin } from "@/lib/auth";
import { buildWeeklyMessages } from "@/lib/sms";
import { createAdminClient } from "@/lib/supabase/server";
import { displayPhone } from "@/lib/phone";
import { fmtDay, isValidDate, todayColombo, WEEKDAYS, weekStart } from "@/lib/time";
import { rs } from "@/lib/types";
import { SMS_FORM_ID, SmsSendForm } from "@/components/sms-form";
import { WeekNav } from "@/components/week-nav";

export default async function SmsPage(props: PageProps<"/admin/sms">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const w = typeof sp.week === "string" && isValidDate(sp.week) ? weekStart(sp.week) : weekStart(todayColombo());
  const settings = await getSettings();
  const [previews, { data: logs }] = await Promise.all([
    buildWeeklyMessages(w, settings),
    createAdminClient().from("sms_logs").select("*").eq("week_start", w).order("created_at", { ascending: false }),
  ]);
  const rows = previews.filter((p) => p.totalOwe > 0 || p.alreadySent).sort((a, b) => b.totalOwe - a.totalOwe);
  const names = new Map(previews.map((p) => [p.personId, p.name]));
  const totalDue = rows.reduce((s, r) => s + r.totalOwe, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Weekly SMS</h1>
          <p className="text-sm text-muted">
            Auto-sends every {WEEKDAYS[settings.billing_weekday - 1]} from {String(settings.sms_send_hour).padStart(2, "0")}:00 to
            everyone who owes money. Sent early? They&apos;re skipped. SMS fee {rs(settings.sms_fee)}, once a week.
          </p>
        </div>
        <WeekNav base="/admin/sms?" ws={w} />
      </div>

      <p className="text-sm">
        {rows.length} people owe a total of <b>{rs(totalDue)}</b> right now.
      </p>

      <SmsSendForm week={w} smsEnabled={settings.sms_enabled} />

      <ul className="card divide-y divide-line py-1">
        {rows.length === 0 && <li className="py-4 text-sm text-muted">Nobody owes anything. Nice.</li>}
        {rows.map((r) => (
          <li key={r.personId} className="flex gap-3 py-3">
            <input
              type="checkbox"
              name="person_ids"
              value={r.personId}
              form={SMS_FORM_ID}
              defaultChecked={!r.alreadySent && !!r.phone}
              disabled={!r.phone}
              className="mt-1 size-4 accent-[var(--brand)]"
              aria-label={`Send to ${r.name}`}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.name}</span>
                <span className="text-xs text-muted">{displayPhone(r.phone) || "no mobile number"}</span>
                {r.alreadySent && <span className="pill bg-brand-soft text-brand-strong">Sent</span>}
              </div>
              <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs break-words">{r.message}</p>
              <p className="text-[11px] text-muted">{r.message.length} chars · {Math.ceil(r.message.length / 160)} SMS</p>
            </div>
            <span className="font-bold text-danger tabular-nums">{rs(r.totalOwe + r.fee)}</span>
          </li>
        ))}
      </ul>

      <section className="card">
        <h2 className="font-bold">Log</h2>
        {(logs ?? []).length === 0 ? (
          <p className="mt-1 text-sm text-muted">No SMS this week yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {(logs ?? []).map((l) => (
              <li key={l.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <b>{names.get(l.person_id) ?? "?"}</b> · {fmtDay(l.created_at.slice(0, 10))}
                  </span>
                  <span
                    className={`pill ${l.status === "sent" ? "bg-brand-soft text-brand-strong" : l.status === "failed" ? "bg-danger-soft text-danger" : "bg-amber-soft text-amber-ink"}`}
                  >
                    {l.status === "dry_run" ? "dry run" : l.status} · {l.trigger}
                  </span>
                </div>
                {l.status === "failed" && <p className="mt-1 text-xs break-all text-danger">{l.provider_response}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
