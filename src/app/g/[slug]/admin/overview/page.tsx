import { redirect } from "next/navigation";
import { can, requireMember } from "@/lib/auth";
import { canSeeOverview, getOverview } from "@/lib/overview";
import { OverviewView } from "@/components/overview-view";

/** Admin › Overview: the group's dashboard. Open to people who can already see everyone's balance. */
export default async function OverviewPage(props: PageProps<"/g/[slug]/admin/overview">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  if (!canSeeOverview(ctx)) redirect(ctx.base);
  const o = await getOverview(ctx);
  return (
    <OverviewView
      o={o}
      base={ctx.base}
      groupName={ctx.org.name}
      can={{ settle: can(ctx, "settle.record_any"), sms: can(ctx, "sms.send"), books: can(ctx, "books.close") }}
    />
  );
}
