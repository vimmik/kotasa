import "server-only";
import { orgDb } from "@/lib/org-db";
import { listMembers } from "@/lib/ledger";
import { getCategories } from "@/lib/org-config";
import { getExpenseCopayers, paidByEach } from "@/lib/payers";
import { daysInMonth } from "@/lib/time";
import { PAID_PART, type Expense, type LedgerRow } from "@/lib/types";
import { toCsv, type Cell } from "@/lib/csv";

/** PostgREST returns at most 1000 rows a request, so read in pages. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const TYPE = { expense: "Expense", meal: "Meal", sms: "SMS fee", settlement: "Payment" } as const;

/** One member's whole history in a group: every line that involves them, newest first. */
export async function historyCsv(orgId: string, memberId: string): Promise<string> {
  const [rows, people] = await Promise.all([
    all<LedgerRow>((a, b) =>
      orgDb(orgId)
        .select("ledger")
        .or(`debtor.eq.${memberId},creditor.eq.${memberId}`)
        .order("entry_date", { ascending: false })
        .order("ref_id")
        .order("debtor")
        .range(a, b),
    ),
    listMembers(orgId, { includeInactive: true }),
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const out: Cell[][] = [["Date", "Type", "Description", "With", "Amount", "Meaning"]];
  for (const r of rows) {
    const mine = r.creditor === memberId; // the line is in my favour
    const other = names.get(mine ? r.debtor : r.creditor) ?? "Someone";
    const amount = Number(r.amount);
    let description = r.label.endsWith(PAID_PART) ? `${r.label.slice(0, -PAID_PART.length)} (part of the bill paid)` : r.label;
    let meaning = mine ? `${other} owes you` : `You owe ${other}`;
    if (r.source === "settlement") {
      // stored reversed: the payer is the creditor
      description = `${mine ? `You paid ${other}` : `${other} paid you`}${r.label === "Payment" ? "" : `: ${r.label}`}`;
      meaning = mine ? "Payment you made" : "Payment you received";
    }
    out.push([r.entry_date, TYPE[r.source], description, other, mine ? amount : -amount, meaning]);
  }
  return toCsv(out);
}

/** Every expense of a group in one month ("YYYY-MM"), with who paid and each person's share. */
export async function expensesCsv(orgId: string, month: string, memberId: string): Promise<string> {
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(from)).padStart(2, "0")}`;
  type Row = Expense & { expense_shares: { person_id: string; amount: number }[] };
  const [rows, people, cats] = await Promise.all([
    all<Row>((a, b) =>
      orgDb(orgId)
        .select("expenses", "*, expense_shares(person_id, amount)")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date")
        .order("created_at")
        .range(a, b),
    ),
    listMembers(orgId, { includeInactive: true }),
    getCategories(orgId, { includeArchived: true }),
  ]);
  const copayers = await getExpenseCopayers(orgId, rows.map((e) => e.id));
  const name = (id: string) => people.find((p) => p.id === id)?.full_name ?? "Someone";
  const catLabel = new Map(cats.map((c) => [c.key, c.label]));
  const out: Cell[][] = [["Date", "Title", "Category", "Amount", "Paid by", "Split", "Your share", "Shares", "Note"]];
  for (const e of rows) {
    const paid = [...paidByEach(Number(e.amount), e.paid_by, copayers.get(e.id) ?? [])];
    out.push([
      e.expense_date,
      e.title,
      catLabel.get(e.category) ?? e.category,
      Number(e.amount),
      paid.length > 1 ? paid.map(([id, amt]) => `${name(id)} ${amt}`).join("; ") : name(e.paid_by),
      e.bill ? "By item" : e.split_type === "equal" ? "Equally" : "Custom",
      Number(e.expense_shares.find((s) => s.person_id === memberId)?.amount ?? 0),
      e.expense_shares.map((s) => `${name(s.person_id)} ${Number(s.amount)}`).join("; "),
      e.note ?? "",
    ]);
  }
  return toCsv(out);
}
