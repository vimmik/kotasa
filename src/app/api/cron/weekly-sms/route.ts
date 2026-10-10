import { NextResponse, type NextRequest } from "next/server";
import { groupsWithSmsOn } from "@/lib/accounts";
import { sendWeeklySms, type SmsRunSummary } from "@/lib/sms";
import { isoWeekday, nowColombo, weekStart } from "@/lib/time";

// Called by Vercel Cron (see vercel.json) or Supabase pg_cron.
// Sends only on the billing weekday, at/after the configured hour,
// and skips anyone who already got this week's SMS (e.g. sent manually earlier).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = nowColombo();
  const force = request.nextUrl.searchParams.get("force") === "1";
  const week = weekStart(now.date);

  // Each group has its own billing day and hour. Already-sent people are skipped, so running
  // this more than once a day is safe.
  const results: Record<string, SmsRunSummary | string> = {};
  for (const group of await groupsWithSmsOn()) {
    const { org, settings } = group;
    if (!force && isoWeekday(now.date) !== settings.billing_weekday) {
      results[org.slug] = "not billing day";
      continue;
    }
    if (!force && now.hour < settings.sms_send_hour) {
      results[org.slug] = "too early";
      continue;
    }
    try {
      results[org.slug] = await sendWeeklySms({ weekStart: week, group, trigger: "schedule" });
    } catch (e) {
      results[org.slug] = `error: ${String(e).slice(0, 200)}`;
    }
  }
  return NextResponse.json({ ok: true, week, groups: results });
}
