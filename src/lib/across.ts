import "server-only";
import { getMemberships } from "@/lib/auth";
import { getPairs, listMembers, summarize } from "@/lib/ledger";
import type { MemberWithLogin, Org } from "@/lib/types";
import { round2 } from "@/lib/types";

/** One group's part of a person's cross-group balance. + they owe me, − I owe them. */
export type AcrossLine = { org: Org; memberId: string; amount: number; canSettle: boolean };

/** Someone I have a balance with in one or more groups, netted in one currency. */
export type AcrossPerson = {
  key: string;
  name: string;
  currency: string;
  net: number; // + they owe me overall, − I owe them overall
  lines: AcrossLine[];
};

/**
 * Who owes me and whom I owe, added up across every group I'm in. The same person is
 * matched by their account, else by mobile or email (guests). Amounts in different
 * currencies are never added together. Payments are still recorded inside each group.
 */
export async function getAcrossGroups(profileId: string): Promise<AcrossPerson[]> {
  const mine = (await getMemberships(profileId)).filter((m) => m.member.status !== "pending");
  const perGroup = await Promise.all(
    mine.map(async ({ member, org }) => {
      const [pairs, people] = await Promise.all([getPairs(org.id), listMembers(org.id, { includeInactive: true })]);
      return { member, org, b: summarize(member.id, pairs), people };
    }),
  );

  // Contacts of everyone with an account, so a guest row with the same mobile/email joins them.
  const byContact = new Map<string, string>();
  for (const g of perGroup)
    for (const p of g.people)
      if (p.profile_id) {
        if (p.phone) byContact.set(`t:${p.phone}`, p.profile_id);
        if (p.email) byContact.set(`e:${p.email.toLowerCase()}`, p.profile_id);
      }
  const identity = (p: MemberWithLogin) => {
    if (p.profile_id) return `p:${p.profile_id}`;
    const viaPhone = p.phone && byContact.get(`t:${p.phone}`);
    const viaEmail = p.email && byContact.get(`e:${p.email.toLowerCase()}`);
    if (viaPhone || viaEmail) return `p:${viaPhone || viaEmail}`;
    if (p.phone) return `t:${p.phone}`;
    if (p.email) return `e:${p.email.toLowerCase()}`;
    return `m:${p.id}`;
  };

  const people = new Map<string, AcrossPerson>();
  const named = new Set<string>(); // keys whose name came from a registered member
  for (const { member, org, b, people: members } of perGroup) {
    const byId = new Map(members.map((p) => [p.id, p]));
    const entries = [...b.owed, ...b.owes.map((x) => ({ ...x, amount: -x.amount }))];
    for (const { personId, amount } of entries) {
      const p = byId.get(personId);
      if (!p || p.profile_id === profileId) continue;
      const key = `${identity(p)}|${org.currency}`;
      let row = people.get(key);
      if (!row) {
        row = { key, name: p.full_name, currency: org.currency, net: 0, lines: [] };
        people.set(key, row);
      } else if (p.registered && !named.has(key)) {
        // Prefer the name the person gave their own account.
        row.name = p.full_name;
      }
      if (p.registered) named.add(key);
      row.net = round2(row.net + amount);
      row.lines.push({ org, memberId: personId, amount, canSettle: member.status === "active" });
    }
  }

  return [...people.values()]
    .map((p) => ({ ...p, lines: p.lines.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
}
