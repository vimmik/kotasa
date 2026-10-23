import { can, requireMember } from "@/lib/auth";
import { closedThrough } from "@/lib/closing";
import { getPairs, listMembers, summarize } from "@/lib/ledger";
import { todayColombo } from "@/lib/time";
import { PageHeader } from "@/components/bits";
import { SettleForm } from "@/components/settle-form";

export default async function SettlePage(props: PageProps<"/g/[slug]/settle">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  const me = ctx.member;
  const sp = await props.searchParams;
  const [people, pairs, through] = await Promise.all([listMembers(ctx.org.id), getPairs(ctx.org.id), closedThrough(ctx.org.id)]);
  const b = summarize(me.id, pairs);

  // ?to=X means I'm paying X; ?from=X means X paid me
  const to = typeof sp.to === "string" ? sp.to : null;
  const from = typeof sp.from === "string" ? sp.from : null;
  const amount = typeof sp.amount === "string" ? sp.amount : "";

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Record a payment" sub="Cash or bank transfer — note it here so balances stay right." />
      <SettleForm
        me={me.id}
        isAdmin={can(ctx, "settle.record_any")}
        pairs={can(ctx, "settle.record_any") ? pairs : []}
        people={people.map((p) => ({ id: p.id, name: p.full_name }))}
        owes={Object.fromEntries(b.owes.map((o) => [o.personId, o.amount]))}
        owed={Object.fromEntries(b.owed.map((o) => [o.personId, o.amount]))}
        initial={{
          direction: from ? "received" : "paid",
          other: to ?? from ?? "",
          amount,
        }}
        today={todayColombo()}
        closedThrough={through}
      />
    </div>
  );
}
