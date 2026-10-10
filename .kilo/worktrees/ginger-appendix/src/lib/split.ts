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
