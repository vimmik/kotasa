import type { OrgContext } from "@/lib/auth";

export type AdminLink = { href: string; label: string };

/** Admin tabs this member may open, in order. The first one is where /admin lands. */
export function adminLinks(ctx: OrgContext): AdminLink[] {
  const b = `${ctx.base}/admin`;
  const has = (p: Parameters<OrgContext["perms"]["has"]>[0]) => ctx.perms.has(p);
  const meals = ctx.settings.meals_enabled;
  return [
    meals && has("meals.manage_menu") && { href: `${b}/packing`, label: "Packing list" },
    meals && has("meals.manage_menu") && { href: `${b}/menu`, label: "Menu" },
    meals && has("meals.order_for_others") && { href: `${b}/orders`, label: "Orders" },
    (has("members.invite") || has("members.manage")) && { href: `${b}/people`, label: "People" },
    has("sms.send") && { href: `${b}/sms`, label: "Weekly SMS" },
    has("books.close") && { href: `${b}/books`, label: "Close books" },
    has("settings.manage") && { href: `${b}/settings`, label: "Settings" },
  ].filter((l): l is AdminLink => !!l);
}
