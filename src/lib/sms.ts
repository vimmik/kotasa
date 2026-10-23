import "server-only";
import { closedThrough } from "@/lib/closing";
import { orgDb } from "@/lib/org-db";
import { getPairs, listMembers, summarize } from "@/lib/ledger";
import { appUrl, BRAND } from "@/lib/brand";
import { addDays, fmtWeek, todayColombo } from "@/lib/time";
import { round2, type Org, type OrgSettings } from "@/lib/types";

/** What the SMS functions need to know about a group. */
export type SmsGroup = { org: Org; settings: OrgSettings };

type SendResult = { ok: boolean; response: string };

/** Longest message we send (4 SMS parts); the bill link has the full breakdown anyway. */
export const SMS_MAX_CHARS = 621;

/** "textlk" (default) or "notifylk", from SMS_PROVIDER. */
function smsProvider() {
  return process.env.SMS_PROVIDER === "notifylk" ? "notifylk" : "textlk";
}

function sendSms(to94: string, message: string): Promise<SendResult> {
  if (message.length > SMS_MAX_CHARS) {
    return Promise.resolve({ ok: false, response: `Message is ${message.length} characters; the limit is ${SMS_MAX_CHARS}` });
  }
  return smsProvider() === "notifylk" ? sendViaNotifyLk(to94, message) : sendViaTextLk(to94, message);
}

/** Sinhala/Tamil names or emoji need unicode mode. */
const isUnicode = (message: string) => /[^\x00-\x7F]/.test(message);

/** How many SMS a message is billed as: 160 chars fit in one, longer ones go in 153-char parts (70/67 in unicode). */
export function smsParts(message: string) {
  const [single, part] = isUnicode(message) ? [70, 67] : [160, 153];
  return message.length <= single ? 1 : Math.ceil(message.length / part);
}

async function readResult(res: Response): Promise<SendResult> {
  const text = await res.text();
  let ok = res.ok;
  try {
    ok = ok && JSON.parse(text).status === "success";
  } catch {
    ok = false;
  }
  return { ok, response: text.slice(0, 500) };
}

/**
 * Send one SMS through Text.lk (https://text.lk/docs/send-sms/, checked 2026-10-10).
 * Env: TEXTLK_API_KEY, TEXTLK_SENDER_ID ("TextLKDemo" until your own sender ID is approved)
 */
async function sendViaTextLk(to94: string, message: string): Promise<SendResult> {
  const apiKey = process.env.TEXTLK_API_KEY;
  const sender = process.env.TEXTLK_SENDER_ID || "TextLKDemo";
  if (!apiKey) return { ok: false, response: "TEXTLK_API_KEY not set" };
  try {
    const res = await fetch("https://app.text.lk/api/v3/sms/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ recipient: to94, sender_id: sender, type: isUnicode(message) ? "unicode" : "plain", message }),
      cache: "no-store",
    });
    return await readResult(res);
  } catch (e) {
    return { ok: false, response: String(e).slice(0, 500) };
  }
}

/**
 * Send one SMS through Notify.lk (https://developer.notify.lk/api-endpoints/, checked 2026-10-10).
 * Env: NOTIFY_USER_ID, NOTIFY_API_KEY, NOTIFY_SENDER_ID ("NotifyDEMO" while testing, case-sensitive)
 */
async function sendViaNotifyLk(to94: string, message: string): Promise<SendResult> {
  const userId = process.env.NOTIFY_USER_ID;
  const apiKey = process.env.NOTIFY_API_KEY;
  const sender = process.env.NOTIFY_SENDER_ID || "NotifyDEMO";
  if (!userId || !apiKey) return { ok: false, response: "NOTIFY_USER_ID / NOTIFY_API_KEY not set" };
  const params = new URLSearchParams({ user_id: userId, api_key: apiKey, sender_id: sender, to: to94, message });
  if (isUnicode(message)) params.set("type", "unicode");
  try {
    // POST so the API key stays out of URLs and request logs.
    const res = await fetch("https://app.notify.lk/api/v1/send", { method: "POST", body: params, cache: "no-store" });
    return await readResult(res);
  } catch (e) {
    return { ok: false, response: String(e).slice(0, 500) };
  }
}

/** One-off test SMS so an admin can check the provider keys before turning SMS on. */
export function sendTestSms(to94: string, groupName: string) {
  return sendSms(to94, `${BRAND.name} test SMS for ${groupName}. If you got this, SMS sending works.`);
}

const n = (x: number) => round2(x).toLocaleString("en-LK");

export function renderTemplate(
  tpl: string,
  v: { name: string; week: string; oweLines: string; total: number; link: string; group: string },
) {
  return tpl
    .replaceAll("{name}", v.name.split(" ")[0])
    .replaceAll("{full_name}", v.name)
    .replaceAll("{week}", v.week)
    .replaceAll("{owe_lines}", v.oweLines)
    .replaceAll("{total}", n(v.total))
    .replaceAll("{link}", v.link)
    .replaceAll("{group}", v.group)
    .replaceAll("{office}", v.group) // older templates
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
  whatsappMessage: string;
};

/** Build this week's message for everyone in the group (used for preview and sending). */
export async function buildWeeklyMessages(weekStart: string, g: SmsGroup): Promise<SmsPreview[]> {
  const { org, settings } = g;
  const [people, pairs, { data: sent }, through] = await Promise.all([
    listMembers(org.id),
    getPairs(org.id),
    orgDb(org.id).select("sms_logs", "person_id").eq("week_start", weekStart).eq("status", "sent"),
    closedThrough(org.id),
  ]);
  // The fee is dated the week's last day; once that day is closed it can't be added any more.
  const weekClosed = !!through && addDays(weekStart, 6) <= through;
  const names = new Map(people.map((p) => [p.id, p.full_name.split(" ")[0]]));
  const sentSet = new Set((sent ?? []).map((s) => s.person_id));
  const collector = settings.collector_id;

  return people.map((p) => {
    const b = summarize(p.id, pairs);
    const alreadySent = sentSet.has(p.id);
    const fee = !alreadySent && !weekClosed && collector && collector !== p.id ? Number(settings.sms_fee) : 0;
    const render = (smsFee: number) => {
      const lines = new Map(b.owes.map((o) => [o.personId, o.amount]));
      if (smsFee && collector) lines.set(collector, (lines.get(collector) ?? 0) + smsFee);
      const oweLines = [...lines.entries()]
        .map(([id, amt]) => `Rs.${n(amt)} to ${names.get(id) ?? "?"}`)
        .join(", ");
      const vars = {
        name: p.full_name,
        week: fmtWeek(weekStart),
        oweLines: oweLines || "nothing to pay",
        total: b.totalOwe + smsFee,
        link: `${appUrl()}/b/${p.view_token}`,
        group: org.name,
      };
      const message = renderTemplate(settings.sms_template, vars);
      // Owing many people can push past the SMS limit; the bill link has the breakdown anyway.
      return message.length > SMS_MAX_CHARS
        ? renderTemplate(settings.sms_template, { ...vars, oweLines: `${lines.size} people (see link)` })
        : message;
    };
    return {
      personId: p.id,
      name: p.full_name,
      phone: p.phone,
      totalOwe: b.totalOwe,
      fee,
      alreadySent,
      message: render(fee),
      // WhatsApp is free, so no SMS fee in that message.
      whatsappMessage: render(0),
    };
  });
}

export type SmsRunSummary = { sent: number; failed: number; dryRun: number; skipped: number; capped: number };

/** SMS actually sent by this group so far this calendar month (Colombo time). */
async function sentThisMonth(orgId: string) {
  const monthStart = `${todayColombo().slice(0, 7)}-01T00:00:00+05:30`;
  const { count } = await orgDb(orgId)
    .select("sms_logs", "id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("created_at", monthStart);
  return count ?? 0;
}

/**
 * Send the weekly SMS.
 * - memberIds given (manual): send to exactly those people.
 * - Otherwise (scheduled): everyone who owes something and hasn't had this week's SMS yet.
 * - The SMS fee is charged once per person per week, owed to the collector.
 */
export async function sendWeeklySms(opts: {
  weekStart: string;
  group: SmsGroup;
  trigger: "manual" | "schedule";
  memberIds?: string[];
}): Promise<SmsRunSummary> {
  const { weekStart, group, trigger, memberIds } = opts;
  const { org, settings } = group;
  const db = orgDb(org.id);
  const previews = await buildWeeklyMessages(weekStart, group);
  const summary: SmsRunSummary = { sent: 0, failed: 0, dryRun: 0, skipped: 0, capped: 0 };
  // Safety net while SMS is free to groups: never send more than the monthly cap.
  let budgetLeft = settings.sms_enabled ? settings.sms_monthly_cap - (await sentThisMonth(org.id)) : Infinity;

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
    if (settings.sms_enabled && budgetLeft <= 0) {
      summary.capped++;
      continue;
    }
    if (!settings.sms_enabled) {
      status = "dry_run";
      response = "SMS sending is OFF in settings (dry run)";
    } else {
      const res = await sendSms(p.phone, p.message);
      status = res.ok ? "sent" : "failed";
      response = res.response;
      if (res.ok) budgetLeft--;
    }

    await db.insert("sms_logs", {
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
