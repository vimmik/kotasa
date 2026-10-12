import { notFound } from "next/navigation";
import { can, requireMember } from "@/lib/auth";
import { duplicateGuests } from "@/lib/accounts";
import { appUrl } from "@/lib/brand";
import { getPairs, summarize } from "@/lib/ledger";
import { getInvites, getRoles } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import type { Member, MemberWithLogin } from "@/lib/types";
import { AddPersonForm, InviteLinks, PendingRow, PersonRow } from "@/components/people-forms";

export default async function PeoplePage(props: PageProps<"/g/[slug]/admin/people">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  const canManage = can(ctx, "members.manage");
  const canInvite = can(ctx, "members.invite");
  if (!canManage && !canInvite) notFound();

  const [{ data }, pairs, roles, invites] = await Promise.all([
    orgDb(ctx.org.id).select("members").order("full_name"),
    getPairs(ctx.org.id),
    getRoles(ctx.org.id),
    canInvite ? getInvites(ctx.org.id) : Promise.resolve([]),
  ]);
  const all: MemberWithLogin[] = ((data ?? []) as Member[]).map((m) => ({ ...m, registered: !!m.profile_id }));
  const pending = all.filter((p) => p.status === "pending");
  const active = all.filter((p) => p.status === "active");
  const inactive = all.filter((p) => p.status === "inactive");
  const withUrl = invites.map((i) => ({ ...i, url: `${appUrl()}/join/${i.code}` }));
  const claimUrl = new Map(withUrl.filter((i) => i.member_id).map((i) => [i.member_id!, i.url]));
  const twins = canManage ? await duplicateGuests(ctx.org.id, all) : new Map<string, Member>();
  const withLogin = all.filter((p) => p.registered && p.status !== "pending").map((p) => ({ id: p.id, name: p.full_name }));

  const row = (p: MemberWithLogin) => (
    <PersonRow
      key={p.id}
      p={p}
      net={summarize(p.id, pairs).net}
      isSelf={p.id === ctx.member.id}
      roles={roles}
      canManage={canManage}
      canInvite={canInvite}
      claimUrl={claimUrl.get(p.id) ?? null}
      twin={twins.get(p.id) ?? null}
      mergeTargets={withLogin}
    />
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">People</h1>

      {canManage && pending.length > 0 && (
        <section className="card border-amber">
          <h2 className="font-semibold">Waiting for approval ({pending.length})</h2>
          <p className="text-xs text-muted">They used an invite link that needs approval.</p>
          <ul className="divide-y divide-line">
            {pending.map((p) => (
              <PendingRow key={p.id} p={p} />
            ))}
          </ul>
        </section>
      )}

      {canInvite && <InviteLinks invites={withUrl} roles={roles} canManage={canManage} />}
      {canInvite && <AddPersonForm roles={roles} canManage={canManage} />}

      <section className="card py-1">
        <h2 className="pt-3 font-semibold">Active ({active.length})</h2>
        <ul className="divide-y divide-line">{active.map(row)}</ul>
      </section>

      {inactive.length > 0 && (
        <section className="card py-1">
          <h2 className="pt-3 font-semibold">Inactive ({inactive.length})</h2>
          <ul className="divide-y divide-line">{inactive.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
