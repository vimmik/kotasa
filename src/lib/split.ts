/** Split `total` equally (to the cent); the first people absorb leftover cents. */
export function splitEqually(total: number, ids: string[]) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / ids.length);
  let extra = cents - base * ids.length;
  return ids.map((id) => {
    const c = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    return { person_id: id, amount: c / 100 };
  });
}

/** One line of a bill and who had it (its price is split equally between them). */
export type BillItem = { name: string; amount: number; people: string[] };
/** Tax, delivery, service charge… (added) or a promotion/discount (taken off). */
export type BillExtra = { label: string; amount: number; kind: "charge" | "discount" };
/** What a bill said, stored on the expense (expenses.bill) so it can be shown and edited. */
export type Bill = { items: BillItem[]; extras: BillExtra[] };

const cents = (n: number) => Math.round(n * 100);

/** Items, charges and discounts, and the bill total (items + charges - discounts). */
export function billTotals(bill: Bill) {
  const items = bill.items.reduce((s, i) => s + cents(i.amount), 0);
  const charges = bill.extras.filter((e) => e.kind === "charge").reduce((s, e) => s + cents(e.amount), 0);
  const discounts = bill.extras.filter((e) => e.kind === "discount").reduce((s, e) => s + cents(e.amount), 0);
  return { items: items / 100, charges: charges / 100, discounts: discounts / 100, total: (items + charges - discounts) / 100 };
}

/**
 * Split a bill by item. Each item is split equally between the people who had it; then tax,
 * charges and discounts are shared in proportion to what each person had, so someone who had
 * a Rs. 975 dish pays a bigger part of the tax and gets a bigger part of the discount than
 * someone who had a Rs. 300 one. Cent-exact: the shares always add up to the bill total.
 * Returns people in the order they first appear, with their item subtotal and final share.
 */
export function splitByItems(bill: Bill) {
  const own = new Map<string, number>(); // cents of items per person
  for (const item of bill.items) {
    if (!item.people.length) continue;
    for (const s of splitEqually(item.amount, item.people)) own.set(s.person_id, (own.get(s.person_id) ?? 0) + cents(s.amount));
  }
  const itemCents = [...own.values()].reduce((a, b) => a + b, 0);
  const totalCents = cents(billTotals(bill).total);
  if (itemCents <= 0) return [];
  // Largest remainder: floor every share, then hand out the leftover cents to the biggest fractions.
  const rows = [...own].map(([id, c]) => {
    const exact = (totalCents * c) / itemCents;
    return { id, itemCents: c, cents: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let left = totalCents - rows.reduce((s, r) => s + r.cents, 0);
  for (const r of [...rows].sort((a, b) => b.frac - a.frac)) {
    if (left <= 0) break;
    r.cents++;
    left--;
  }
  return rows.map((r) => ({ person_id: r.id, items: r.itemCents / 100, amount: r.cents / 100 }));
}
