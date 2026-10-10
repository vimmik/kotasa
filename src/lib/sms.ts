import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getPairs, listPeople, summarize } from "@/lib/ledger";
import { appUrl, BRAND } from "@/lib/brand";
import { fmtWeek } from "@/lib/time";
import { round2, type Settings } from "@/lib/types";

type SendResult = { ok: boolean; response: string };

/**
 * Send one SMS through Notify.lk. Check their current API docs before going live.
 * Env: NOTIFY_USER_ID, NOTIFY_API_KEY, NOTIFY_SENDER_ID ("NotifyDEMO" while testing)
 */
async function sendViaNotifyLk(to94: string, message: string): Promise<SendResult> {
  const userId = process.env.NOTIFY_USER_ID;
  const apiKey = process.env.NOTIFY_API_KEY;
  const sender = process.env.NOTIFY_SENDER_ID || "NotifyDEMO";
  if (!userId || !apiKey) return { ok: false, response: "NOTIFY_USER_ID / NOTIFY_API_KEY not set" };
  const params = new URLSearchParams({ user_id: userId, api_key: apiKey, sender_id: sender, to: to94, message });
  try {
    const res = await fetch(`https://app.notify.lk/api/v1/send?${params}`, { cache: "no-store" });
    const text = await res.text();
    let ok = res.ok;
    try {
      ok = ok && JSON.parse(text).status === "success";
    } catch {
      /* non-JSON */
    }
    return { ok, response: text.slice(0, 500) };
  } catch (e) {
    return { ok: false, response: String(e).slice(0, 500) };
  }
}

const n = (x: number) => round2(x).toLocaleString("en-LK");

export function renderTemplate(
  tpl: string,
  v: { name: string; week: string; oweLines: string; total: number; link: string; office: string },
) {
  return tpl
    .replaceAll("{name}", v.name.split(" ")[0])
    .replaceAll("{full_name}", v.name)
    .replaceAll("{week}", v.week)
    .replaceAll("{owe_lines}", v.oweLines)
    .replaceAll("{total}", n(v.total))
    .replaceAll("{link}", v.link)
    .replaceAll("{office}", v.office)
    .replaceAll("{app}", BRAND.name);
}

export type SmsPreview = {
  personId: string;
  name: string;
  phone: string | null;
  totalOwe: number;
  fee: number;
  alreadySent: boolean;
  message: string;
};

/** Build this week's message for everyone (used for preview and sending). */
export async function buildWeeklyMessages(weekStart: string, settings: Settings): Promise<SmsPreview[]> {
  const admin = createAdminClient();
  const [people, pairs, { data: sent }] = await Promise.all([
    listPeople(),
    getPairs(),
    admin.from("sms_logs").select("person_id").eq("week_start", weekStart).eq("status", "sent"),
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name.split(" ")[0]]));
  const sentSet = new Set((sent ?? []).map((s) => s.person_id));
  const collector = settings.collector_id;

  return people.map((p) => {
    const b = summarize(p.id, pairs);
    const alreadySent = sentSet.has(p.id);
    const fee = !alreadySent && collector && collector !== p.id ? Number(settings.sms_fee) : 0;
    const lines = new Map(b.owes.map((o) => [o.personId, o.amount]));
    if (fee && collector) lines.set(collector, (lines.get(collector) ?? 0) + fee);
    const oweLines = [...lines.entries()]
      .map(([id, amt]) => `Rs.${n(amt)} to ${names.get(id) ?? "?"}`)
      .join(", ");
    const total = b.totalOwe + fee;
    return {
      personId: p.id,
      name: p.full_name,
      phone: p.phone,
      totalOwe: b.totalOwe,
      fee,
      alreadySent,
      message: renderTemplate(settings.sms_template, {
        name: p.full_name,
        week: fmtWeek(weekStart),
        oweLines: oweLines || "nothing to pay",
        total,
        link: `${appUrl()}/b/${p.view_token}`,
        office: settings.office_name,
      }),
    };
  });
}

export type SmsRunSummary = { sent: number; failed: number; dryRun: number; skipped: number };

/**
 * Send the weekly SMS.
 * - memberIds given (manual): send to exactly those people.
 * - Otherwise (scheduled): everyone who owes something and hasn't had this week's SMS yet.
 * - The SMS fee is charged once per person per week, owed to the collector.
 */
export async function sendWeeklySms(opts: {
  weekStart: string;
  settings: Settings;
  trigger: "manual" | "schedule";
  memberIds?: string[];
}): Promise<SmsRunSummary> {
  const { weekStart, settings, trigger, memberIds } = opts;
  const admin = createAdminClient();
  const previews = await buildWeeklyMessages(weekStart, settings);
  const summary: SmsRunSummary = { sent: 0, failed: 0, dryRun: 0, skipped: 0 };

  for (const p of previews) {
    if (memberIds ? !memberIds.includes(p.personId) : p.alreadySent || p.totalOwe <= 0) {
      if (!memberIds) summary.skipped++;
      continue;
    }
    if (!p.phone) {
      summary.skipped++;
      continue;
    }

    let status: "sent" | "failed" | "dry_run";
    let response: string;
    if (!settings.sms_enabled) {
      status = "dry_run";
      response = "SMS sending is OFF in settings (dry run)";
    } else {
      const res = await sendViaNotifyLk(p.phone, p.message);
      status = res.ok ? "sent" : "failed";
      response = res.response;
    }

    await admin.from("sms_logs").insert({
      person_id: p.personId,
      collector_id: settings.collector_id,
      week_start: weekStart,
      phone: p.phone,
      message: p.message,
      fee: status === "sent" ? p.fee : 0,
      status,
      provider_response: response,
      trigger,
    });
    if (status === "sent") summary.sent++;
    else if (status === "failed") summary.failed++;
    else summary.dryRun++;
  }
  return summary;
}
