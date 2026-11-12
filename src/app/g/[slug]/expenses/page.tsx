import Form from "next/form";
import Link from "next/link";
import { ChartBar, MagnifyingGlass, Plus, X } from "@phosphor-icons/react/ssr";
import { can, requireMember } from "@/lib/auth";
import { listMembers } from "@/lib/ledger";
import { getCategories } from "@/lib/org-config";
import { orgDb } from "@/lib/org-db";
import { getExpenseCopayers, paidByEach } from "@/lib/payers";
import { addDays, fmtDay, fmtWeek, isValidDate, todayColombo, weekStart } from "@/lib/time";
import { rs, type Expense, type ExpenseShare } from "@/lib/types";
import { CategoryIcon, EmptyState, PageHeader } from "@/components/bits";
import { WeekNav } from "@/components/week-nav";

/** Most results a search shows; older matches need a more exact word. */
const SEARCH_LIMIT = 60;

export default async function ExpensesPage(props: PageProps<"/g/[slug]/expenses">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  const { org, member: me, base } = ctx;
  const sp = await props.searchParams;
  const w = typeof sp.week === "string" && isValidDate(sp.week) ? weekStart(sp.week) : weekStart(todayColombo());
  const mine = sp.show !== "all";
  // Search looks through every week (title and note). Characters that mean something in the
  // filter syntax are dropped, so the text can only ever be a search word.
  const q = (typeof sp.q === "string" ? sp.q : "").replace(/[%_,()*\\"]/g, " ").trim().slice(0, 40);

  const base_ = orgDb(org.id).select("expenses", "*, expense_shares(person_id, amount)");
  const [{ data }, people, cats] = await Promise.all([
    (q
      ? base_.or(`title.ilike.%${q}%,note.ilike.%${q}%`).limit(SEARCH_LIMIT)
      : base_.gte("expense_date", w).lte("expense_date", addDays(w, 6))
    )
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
    listMembers(org.id, { includeInactive: true }),
    getCategories(org.id, { includeArchived: true }),
  ]);
  const iconOf = new Map(cats.map((c) => [c.key, c.icon]));
  const names = new Map(people.map((p) => [p.id, p.full_name.split(" ")[0]]));
  type Row = Expense & { expense_shares: Pick<ExpenseShare, "person_id" | "amount">[] };
  let rows = (data ?? []) as Row[];
  const copayers = await getExpenseCopayers(org.id, rows.map((e) => e.id));
  const paidOf = (e: Row) => paidByEach(Number(e.amount), e.paid_by, copayers.get(e.id) ?? []);
  if (mine) rows = rows.filter((e) => paidOf(e).has(me.id) || e.expense_shares.some((s) => s.person_id === me.id));
  const total = rows.reduce((s, e) => s + Number(e.amount), 0);

  const tab = (val: "mine" | "all", label: string) => (
    <Link
      href={`${base}/expenses?${q ? `q=${encodeURIComponent(q)}` : `week=${w}`}${val === "all" ? "&show=all" : ""}`}
      aria-current={(val === "mine") === mine ? "page" : undefined}
      className={`rounded-[10px] px-3 py-1.5 ${(val === "mine") === mine ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="stagger space-y-4">
      <PageHeader
        title="Expenses"
        sub={q ? `${rows.length}${rows.length >= SEARCH_LIMIT ? "+" : ""} found for “${q}” · ${rs(total)}` : `${rows.length} this week · ${rs(total)}`}
        action={
          can(ctx, "expense.add") && (
            <Link href={`${base}/expenses/new`} className="btn-primary">
              <Plus size={16} aria-hidden="true" /> Add
            </Link>
          )
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5 text-sm font-semibold">
          {tab("mine", "Involving me")}
          {tab("all", "Everyone")}
        </div>
        {!q && <WeekNav base={`${base}/expenses${mine ? "?" : "?show=all&"}`} ws={w} />}
      </div>

      <div className="flex items-center gap-2">
        <Form action={`${base}/expenses`} className="relative min-w-0 flex-1">
          {!mine && <input type="hidden" name="show" value="all" />}
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            key={q}
            maxLength={40}
            enterKeyHint="search"
            placeholder="Search all expenses"
            aria-label="Search all expenses"
            className="input pl-9"
          />
        </Form>
        {q && (
          <Link href={`${base}/expenses${mine ? "" : "?show=all"}`} className="btn-ghost size-10 shrink-0 p-0" aria-label="Clear search">
            <X size={16} aria-hidden="true" />
          </Link>
        )}
        <Link href={`${base}/insights`} className="btn-ghost shrink-0 px-3" aria-label="Insights: where the money went">
          <ChartBar size={16} aria-hidden="true" /> <span className="hidden sm:inline">Insights</span>
        </Link>
      </div>

      {rows.length === 0 ? (
        q ? (
          <EmptyState title={`Nothing found for “${q}”`} body={mine ? "Try another word, or look under Everyone." : "Try another word."} />
        ) : (
          <EmptyState title="No expenses this week" body="Rides, snacks, gifts — add it and split it in seconds." />
        )
      ) : (
        <ul className="card divide-y divide-line py-1">
          {rows.map((e) => {
            const myShare = Number(e.expense_shares.find((s) => s.person_id === me.id)?.amount ?? 0);
            const paid = paidOf(e);
            const net = (paid.get(me.id) ?? 0) - myShare;
            const payers = [...paid.keys()].map((id) => (id === me.id ? "You" : names.get(id)));
            const mineLine =
              net > 0.004
                ? { text: `you lent ${rs(net)}`, cls: "text-brand" }
                : net < -0.004
                  ? { text: `you owe ${rs(-net)}`, cls: "text-danger" }
                  : { text: paid.has(me.id) || myShare ? "settled" : "not involved", cls: "text-muted" };
            return (
              <li key={e.id}>
                <Link href={`${base}/expenses/${e.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-surface-2">
                  <CategoryIcon icon={iconOf.get(e.category)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{e.title}</p>
                    <p className="truncate text-xs text-muted">
                      {fmtDay(e.expense_date)} · {payers.length > 2 ? `${payers[0]} + ${payers.length - 1}` : payers.join(" + ")} paid {rs(e.amount)}
                    </p>
                  </div>
                  <span className={`text-right text-xs font-semibold ${mineLine.cls}`}>{mineLine.text}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-center text-xs text-muted">{q ? "Searched every week" : fmtWeek(w)}</p>
    </div>
  );
}
