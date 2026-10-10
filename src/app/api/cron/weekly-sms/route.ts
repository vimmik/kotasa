import { NextResponse, type NextRequest } from "next/server";
import { getSettings } from "@/lib/auth";
import { sendWeeklySms } from "@/lib/sms";
import { isoWeekday, nowColombo, weekStart } from "@/lib/time";

// Called by Vercel Cron (see vercel.json) or Supabase pg_cron.
// Sends only on the billing weekday, at/after the configured hour,
// and skips anyone who already got this week's SMS (e.g. sent manually earlier).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getSettings();
  const now = nowColombo();
  const force = request.nextUrl.searchParams.get("force") === "1";

  if (!force && isoWeekday(now.date) !== settings.billing_weekday) {
    return NextResponse.json({ skipped: "not billing day", today: now.date });
  }
  if (!force && now.hour < settings.sms_send_hour) {
    return NextResponse.json({ skipped: "too early", hour: now.hour });
  }

  const summary = await sendWeeklySms({
    weekStart: weekStart(now.date),
    settings,
    trigger: "schedule",
  });
  return NextResponse.json({ ok: true, week: weekStart(now.date), ...summary });
}
