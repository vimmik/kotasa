import { type NextRequest } from "next/server";
import { requireMember } from "@/lib/auth";
import { expensesCsv, historyCsv } from "@/lib/export";
import { todayColombo } from "@/lib/time";

// CSV downloads for a member of the group (anyone else gets the usual 404):
//   ?type=history                 everything that involves me, all time
//   ?type=expenses&month=YYYY-MM  the group's expenses in one month (the same list as Expenses > Everyone)
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireMember(slug);
  const q = request.nextUrl.searchParams;
  const today = todayColombo();

  let csv: string;
  let name: string;
  if (q.get("type") === "expenses") {
    const m = q.get("month") ?? "";
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7);
    csv = await expensesCsv(ctx.org.id, month, ctx.member.id);
    name = `kotasa-${slug}-expenses-${month}.csv`;
  } else {
    csv = await historyCsv(ctx.org.id, ctx.member.id);
    name = `kotasa-${slug}-my-history-${today}.csv`;
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
