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
  // Opened without a person: start on the likely case. Nobody to pay but someone owes you ->
  // "Someone paid me"; just one person on that side -> pick them and their balance.
  const direction: "paid" | "received" = from || (!to && !b.owes.length && b.owed.length) ? "received" : "paid";
  const side = direction === "paid" ? b.owes : b.owed;
  const only = !to && !from && side.length === 1 ? side[0] : null;
  const initial = {
    direction,
    other: to ?? from ?? only?.personId ?? "",
    amount: amount || (only ? String(only.amount) : ""),
  };

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
        initial={initial}
        today={todayColombo()}
        closedThrough={through}
      />
    </div>
  );
}
