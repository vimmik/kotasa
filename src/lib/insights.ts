// Insights: plain date and number work shared by Me › Insights, a group's Insights and the admin
// Overview. No database and no "server-only" here, so the rules can be tested on their own.
// Everything is worked out from rules (no AI): the same numbers always give the same tips.
import { addDays, daysInMonth, fmtDay, isoWeekday, WEEKDAYS } from "@/lib/time";
import { round2 } from "@/lib/types";

/** One thing that was spent. For Me it is your part; for a group it is the whole expense. */
export type Entry = {
  date: string;
  amount: number;
  category: string;
  title: string;
  /** Me only: your own entry (true) or your share of something in a group (false) */
  own?: boolean;
  /** left out of "biggest" and "most often" (meal orders in a group: one line per plate) */
  bulk?: boolean;
};

export type Tone = "warn" | "good" | "info";

/** One finding in plain words, most useful first. */
export type Tip = {
  id: string;
  tone: Tone;
  title: string;
  body: string;
  href?: string;
  cta?: string;
};

export type MonthTotal = {
  /** "YYYY-MM" */
  month: string;
  total: number;
  /** spent up to the same day of the month as the month being looked at (the whole month for a past one) */
  toDate: number;
  /** no entries here or in any earlier month that was loaded */
  before: boolean;
};

export type CategoryStat = {
  key: string;
  amount: number;
  /** average of the months before, up to the same day; null when there is nothing to compare with */
  usual: number | null;
  count: number;
};

export type Analysis = {
  month: string;
  /** the month being looked at is still running */
  current: boolean;
  /** days of the month counted so far (all of them for a past month) */
  elapsed: number;
  days: number;
  total: number;
  count: number;
  /** oldest first, ending with `month` */
  months: MonthTotal[];
  /** months the usual is averaged over (up to 3, right before this one) */
  baseline: string[];
  /** average spent by this day in the baseline months */
  usual: number | null;
  /** average of the baseline months in full */
  usualFull: number | null;
  /** last month up to the same day; null when it had nothing and nothing came before it */
  prev: number | null;
  perDay: number;
  /** where the month lands if the pace so far keeps up; null until 5 days are in */
  projected: number | null;
  categories: CategoryStat[];
  /** Monday first: what an average Monday, Tuesday… cost this month */
  weekdays: { label: string; total: number; days: number; spendDays: number; avg: number }[];
  noSpendDays: number;
  biggest: Entry[];
  /** the same thing bought 3 times or more, by what it added up to */
  repeats: { title: string; count: number; total: number; category: string }[];
  topDay: { date: string; total: number } | null;
  own: number;
  groups: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** `n` months ending with `last` ("YYYY-MM"), oldest first. */
export function monthList(last: string, n: number): string[] {
  const [y, m] = last.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`);
  }
  return out;
}

/** "Nov" or "November" (with the year when asked). */
export function monthName(month: string, style: "short" | "long" = "long", year = false) {
  const d = new Date(`${month}-01T00:00:00Z`);
  // en-GB shortens September to "Sept"; three letters keep twelve labels in a row on a phone.
  const name = d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return `${style === "short" ? name.slice(0, 3) : name}${year ? ` ${month.slice(0, 4)}` : ""}`;
}

/** 950, 12.4K, 1.3M: for the small labels on a chart. */
export function compact(n: number) {
  const a = Math.abs(n);
  if (a < 1000) return String(Math.round(n));
  if (a < 1_000_000) return `${(n / 1000).toFixed(a < 100_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Averages come with stray cents: whole numbers from 100 up, two decimals below. */
export const tidy = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : round2(n));

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const sum = (list: Entry[]) => list.reduce((s, e) => s + e.amount, 0);

/**
 * Everything the Insights pages show for one month, from the entries of that month and the
 * months before it. A month that is still running is compared like for like: "by the 15th you
 * usually spend…", never a half month against whole ones.
 */
export function analyse(entries: Entry[], opts: { month: string; today: string; span: number }): Analysis {
  const { month, today } = opts;
  const current = month === today.slice(0, 7);
  const days = daysInMonth(`${month}-01`);
  const elapsed = current ? Number(today.slice(8, 10)) : days;
  const cut = pad(current ? elapsed : 31);

  const byMonth = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = e.date.slice(0, 7);
    const list = byMonth.get(k);
    if (list) list.push(e);
    else byMonth.set(k, [e]);
  }
  let seen = false;
  const months: MonthTotal[] = monthList(month, opts.span).map((m) => {
    const list = byMonth.get(m) ?? [];
    if (list.length) seen = true;
    return {
      month: m,
      total: round2(sum(list)),
      toDate: round2(sum(list.filter((e) => e.date.slice(8, 10) <= cut))),
      before: !seen,
    };
  });

  const mine = (byMonth.get(month) ?? []).filter((e) => e.date <= (current ? today : `${month}-31`));
  const total = round2(sum(mine));
  // Entries dated ahead (tomorrow's meal order) aren't spent yet.
  months[months.length - 1].total = total;
  const earlier = months.slice(0, -1).filter((m) => !m.before);
  const baseline = earlier.slice(-3).map((m) => m.month);
  const avg = (pick: (m: MonthTotal) => number) =>
    baseline.length ? round2(earlier.slice(-3).reduce((s, m) => s + pick(m), 0) / baseline.length) : null;
  const last = months.at(-2);

  // By category, against the same categories up to the same day in the baseline months.
  const cats = new Map<string, { amount: number; count: number }>();
  for (const e of mine) {
    const c = cats.get(e.category) ?? { amount: 0, count: 0 };
    cats.set(e.category, { amount: c.amount + e.amount, count: c.count + 1 });
  }
  const usualBy = new Map<string, number>();
  for (const m of baseline)
    for (const e of byMonth.get(m) ?? [])
      if (e.date.slice(8, 10) <= cut) usualBy.set(e.category, (usualBy.get(e.category) ?? 0) + e.amount);
  const categories: CategoryStat[] = [...new Set([...cats.keys(), ...usualBy.keys()])]
    .map((key) => ({
      key,
      amount: round2(cats.get(key)?.amount ?? 0),
      count: cats.get(key)?.count ?? 0,
      usual: baseline.length ? round2((usualBy.get(key) ?? 0) / baseline.length) : null,
    }))
    .sort((a, b) => b.amount - a.amount || (b.usual ?? 0) - (a.usual ?? 0));

  // Days of the week: how many of each have gone by, and what each cost on average.
  const perDate = new Map<string, number>();
  for (const e of mine) perDate.set(e.date, (perDate.get(e.date) ?? 0) + e.amount);
  const weekdays = WEEKDAYS.map((label) => ({ label, total: 0, days: 0, spendDays: 0, avg: 0 }));
  for (let i = 0; i < elapsed; i++) {
    const d = addDays(`${month}-01`, i);
    const w = weekdays[isoWeekday(d) - 1];
    w.days += 1;
    const spent = perDate.get(d);
    if (spent) {
      w.total += spent;
      w.spendDays += 1;
    }
  }
  for (const w of weekdays) {
    w.total = round2(w.total);
    w.avg = w.days ? round2(w.total / w.days) : 0;
  }

  const single = mine.filter((e) => !e.bulk);
  const groups = new Map<string, { title: string; count: number; total: number; category: string }>();
  for (const e of single) {
    const k = norm(e.title);
    const g = groups.get(k);
    if (g) {
      g.count += 1;
      g.total += e.amount;
    } else groups.set(k, { title: e.title.trim(), count: 1, total: e.amount, category: e.category });
  }
  const top = [...perDate.entries()].sort((a, b) => b[1] - a[1])[0];
  const perDay = elapsed ? round2(total / elapsed) : 0;

  return {
    month,
    current,
    elapsed,
    days,
    total,
    count: mine.length,
    months,
    baseline,
    usual: avg((m) => m.toDate),
    usualFull: avg((m) => m.total),
    prev: last && !last.before ? last.toDate : null,
    perDay,
    projected: current && elapsed >= 5 && elapsed < days ? round2(perDay * days) : null,
    categories,
    weekdays,
    noSpendDays: elapsed - perDate.size,
    biggest: [...single].sort((a, b) => b.amount - a.amount).slice(0, 5),
    repeats: [...groups.values()]
      .filter((g) => g.count >= 3)
      .map((g) => ({ ...g, total: round2(g.total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),
    topDay: top ? { date: top[0], total: round2(top[1]) } : null,
    own: round2(sum(mine.filter((e) => e.own))),
    groups: round2(sum(mine.filter((e) => e.own === false))),
  };
}

/** Whole-number percent of a part in a total (0 when there is no total). */
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** "by the 15th" for a running month, "in October" for a finished one. */
function when(a: Analysis) {
  return a.current ? "so far" : `in ${monthName(a.month)}`;
}

function usualWords(a: Analysis) {
  const n = a.baseline.length;
  const span = n === 1 ? monthName(a.baseline[0]) : `the ${n} months before`;
  return a.current ? `by day ${a.elapsed} of ${span}` : `in ${span}`;
}

type Words = {
  fmt: (n: number) => string;
  /** label of a category key */
  label: (key: string) => string;
  /** where a category's entries can be seen */
  categoryHref?: (key: string) => string | undefined;
  /** "You've" for Me, "The group has" for a group */
  subject: "you" | "group";
};

/**
 * Findings that hold for any list of spending: the total against the usual, the categories
 * that moved most, one entry that dominates, and the costliest day of the week.
 */
export function changeTips(a: Analysis, words: Words): Tip[] {
  const w = { ...words, fmt: (n: number) => words.fmt(tidy(n)) };
  const out: Tip[] = [];
  const who = w.subject === "you" ? "You've" : "The group has";
  const enough = a.elapsed >= 5 && a.total > 0;

  if (enough && a.usual && a.usual > 0) {
    const diff = a.total - a.usual;
    const p = Math.round((Math.abs(diff) / a.usual) * 100);
    if (p >= 15) {
      out.push({
        id: "total",
        tone: diff > 0 ? "warn" : "good",
        title: `Spending is ${diff > 0 ? "up" : "down"} ${p}% on the usual`,
        body: `${who} spent ${w.fmt(a.total)} ${when(a)}, against about ${w.fmt(a.usual)} ${usualWords(a)}.`,
      });
    }
  }

  if (enough && a.usual !== null) {
    const floor = Math.max(a.usual, a.total) * 0.08;
    const moved = a.categories
      .map((c) => ({ ...c, diff: c.amount - (c.usual ?? 0) }))
      .filter((c) => Math.abs(c.diff) >= floor && Math.abs(c.diff) >= (c.usual ?? 0) * 0.25);
    const up = moved.filter((c) => c.diff > 0).sort((x, y) => y.diff - x.diff)[0];
    const down = moved.filter((c) => c.diff < 0).sort((x, y) => x.diff - y.diff)[0];
    if (up) {
      const fresh = !up.usual;
      // A category with no history is only news once there is some history to miss it from.
      if (!fresh || a.baseline.length >= 2) {
        out.push({
          id: `up-${up.key}`,
          tone: "warn",
          title: fresh ? `${w.label(up.key)} is new this month` : `${w.label(up.key)} is up ${w.fmt(round2(up.diff))}`,
          body: fresh
            ? `${w.fmt(up.amount)} ${when(a)}, and nothing ${usualWords(a)}.`
            : `${w.fmt(up.amount)} ${when(a)}, against a usual ${w.fmt(up.usual ?? 0)} ${usualWords(a)}.`,
          href: w.categoryHref?.(up.key),
          cta: "See what it was",
        });
      }
    }
    if (down) {
      out.push({
        id: `down-${down.key}`,
        tone: "good",
        title: `${w.label(down.key)} is down ${w.fmt(round2(-down.diff))}`,
        body: `${w.fmt(down.amount)} ${when(a)}, against a usual ${w.fmt(down.usual ?? 0)} ${usualWords(a)}.`,
      });
    }
  }

  const big = a.biggest[0];
  if (big && a.count >= 4 && big.amount >= a.total * 0.3) {
    out.push({
      id: "single",
      tone: "info",
      title: `One expense was ${pct(big.amount, a.total)}% of the month`,
      body: `${big.title}: ${w.fmt(big.amount)} on ${fmtDay(big.date)}. Without it the month comes to ${w.fmt(round2(a.total - big.amount))}.`,
    });
  }

  if (a.elapsed >= 14 && a.perDay > 0) {
    const day = [...a.weekdays].filter((d) => d.days >= 2 && d.spendDays >= 2).sort((x, y) => y.avg - x.avg)[0];
    if (day && day.avg >= a.perDay * 1.5) {
      out.push({
        id: "weekday",
        tone: "info",
        title: `${day.label}s cost the most`,
        body: `About ${w.fmt(Math.round(day.avg))} each ${day.label}, against ${w.fmt(Math.round(a.perDay))} on an average day.`,
      });
    }
  }
  return out;
}

export type MeTipInput = {
  fmt: (n: number) => string;
  label: (key: string) => string;
  categoryHref?: (key: string) => string | undefined;
  /** the main budget this month; undefined when there is none. Only for the running month. */
  budget?: { id: string; name: string; limit: number; left: number; projected: number; perDay: number; daysLeft: number } | null;
  /** take-home pay a month, when the person gave it */
  income?: number | null;
  /** false when only part of the spending is being looked at (just mine / only groups) */
  whole: boolean;
};

/** Tips for Me › Insights, most useful first. */
export function meTips(a: Analysis, t: MeTipInput): Tip[] {
  const out: Tip[] = [];
  const fmt = (n: number) => t.fmt(tidy(n));

  if (t.whole && a.current && t.budget) {
    const b = t.budget;
    if (b.left < 0) {
      out.push({
        id: "budget",
        tone: "warn",
        title: `${b.name} is ${fmt(round2(-b.left))} over`,
        body: `${b.daysLeft > 1 ? `${b.daysLeft} days are left in it. ` : ""}Anything more adds to what you're over by.`,
        href: `/me/budgets/${b.id}`,
        cta: "Open the budget",
      });
    } else if (b.daysLeft > 1 && b.projected > b.limit * 1.03) {
      out.push({
        id: "budget",
        tone: "warn",
        title: `On pace to go ${fmt(round2(b.projected - b.limit))} over ${b.name}`,
        body: `Keep to about ${fmt(Math.max(0, Math.floor(b.perDay)))} a day for the ${b.daysLeft} days left and you land on budget.`,
        href: `/me/budgets/${b.id}`,
        cta: "Open the budget",
      });
    } else if (b.daysLeft > 1 && b.projected > 0 && b.projected < b.limit * 0.97) {
      out.push({
        id: "budget",
        tone: "good",
        title: `On pace to finish ${fmt(round2(b.limit - b.projected))} under ${b.name}`,
        body: `${fmt(b.left)} is left for the ${b.daysLeft} days to go.`,
        href: `/me/budgets/${b.id}`,
        cta: "Open the budget",
      });
    }
  }

  if (t.whole && t.income && t.income > 0 && a.total > 0) {
    const kept = round2(t.income - a.total);
    if (!a.current) {
      out.push(
        kept < 0
          ? {
              id: "income",
              tone: "warn",
              title: `You spent ${fmt(-kept)} more than your pay`,
              body: `${fmt(a.total)} went out in ${monthName(a.month)}, against a take-home pay of ${fmt(t.income)}.`,
            }
          : {
              id: "income",
              tone: kept >= t.income * 0.2 ? "good" : "info",
              title: `You kept ${pct(kept, t.income)}% of your pay`,
              body: `${fmt(kept)} of ${fmt(t.income)} was left after everything recorded in ${monthName(a.month)}.`,
            },
      );
    } else if (a.projected && a.projected > t.income) {
      out.push({
        id: "income",
        tone: "warn",
        title: "On pace to spend more than your pay",
        body: `At this pace the month comes to about ${fmt(Math.round(a.projected))}, against a take-home pay of ${fmt(t.income)}.`,
      });
    }
  }

  out.push(...changeTips(a, { fmt, label: t.label, categoryHref: t.categoryHref, subject: "you" }));

  const often = a.repeats.find((r) => r.count >= 4 && r.total >= a.total * 0.08);
  if (often) {
    out.push({
      id: "repeat",
      tone: "info",
      title: `${often.title} adds up: ${often.count} times, ${fmt(often.total)}`,
      body: `That's ${pct(often.total, a.total)}% of the month, about ${fmt(Math.round(often.total / often.count))} each time.`,
    });
  }

  if (t.whole && a.current && t.budget === null && a.count >= 5) {
    out.push({
      id: "no-budget",
      tone: "info",
      title: "No budget yet",
      body: a.usualFull
        ? `A usual month is about ${fmt(Math.round(a.usualFull))}. Set a budget near that and Kotasa tells you what's safe to spend each day.`
        : "Set a budget and Kotasa tells you what's safe to spend each day.",
      href: "/me/budgets/new?main=1",
      cta: "Set a budget",
    });
  }

  if (a.elapsed >= 7 && a.total > 0 && a.noSpendDays >= 3) {
    out.push({
      id: "no-spend",
      tone: "good",
      title: `${a.noSpendDays} days with nothing spent`,
      body: `Out of ${a.elapsed} days ${a.current ? "so far this month" : `in ${monthName(a.month)}`}.`,
    });
  }

  if (t.whole && a.groups >= a.total * 0.5 && a.groups > 0 && a.own > 0) {
    out.push({
      id: "groups",
      tone: "info",
      title: `${pct(a.groups, a.total)}% of your spending came through groups`,
      body: `${fmt(a.groups)} was your share of group expenses and meals. ${fmt(a.own)} you added yourself.`,
    });
  }
  return rank(out);
}

export type GroupTipInput = {
  fmt: (n: number) => string;
  label: (key: string) => string;
  base: string;
  /** my share of the month and what I paid up front */
  mine: number;
  iPaid: number;
  /** biggest first; name is "You" for the viewer */
  payers: { name: string; amount: number }[];
  /** key of the catch-all category */
  otherKey?: string;
};

/** Tips for a group's Insights (one month), most useful first. */
export function groupTips(a: Analysis, t: GroupTipInput): Tip[] {
  const out: Tip[] = [];
  const fmt = (n: number) => t.fmt(tidy(n));
  const gap = round2(t.iPaid - t.mine);
  if (a.total > 0 && Math.abs(gap) >= Math.max(1, a.total * 0.05)) {
    out.push(
      gap > 0
        ? {
            id: "fronted",
            tone: "info",
            title: `You paid ${fmt(gap)} more than your share`,
            body: `You put in ${fmt(t.iPaid)} ${when(a)} and your share is ${fmt(t.mine)}. Home shows who owes you now.`,
            href: t.base,
            cta: "See who owes you",
          }
        : {
            id: "covered",
            tone: "info",
            title: `Others paid ${fmt(-gap)} of your share`,
            body: `Your share is ${fmt(t.mine)} ${when(a)} and you paid ${fmt(t.iPaid)} up front. Home shows what you owe now.`,
            href: t.base,
            cta: "See what you owe",
          },
    );
  }

  out.push(...changeTips(a, { fmt, label: t.label, subject: "group" }));

  const paidTotal = t.payers.reduce((s, p) => s + p.amount, 0);
  const top = t.payers[0];
  if (top && t.payers.length >= 3 && top.amount >= paidTotal * 0.6) {
    const you = top.name === "You";
    out.push({
      id: "payer",
      tone: "info",
      title: `${top.name} paid for ${pct(top.amount, paidTotal)}% of everything`,
      body: you
        ? "You're carrying most of the group's spending. A reminder from Home gets it back sooner."
        : `Paying ${top.name.split(" ")[0]} back often keeps one person from carrying the group.`,
      href: t.base,
      cta: you ? "See who owes you" : "See what you owe",
    });
  }

  const other = t.otherKey ? a.categories.find((c) => c.key === t.otherKey) : undefined;
  if (other && other.count >= 4 && other.amount >= a.total * 0.3) {
    out.push({
      id: "other",
      tone: "info",
      title: `${pct(other.amount, a.total)}% is under ${t.label(other.key)}`,
      body: "Pick a category when you add an expense and this page shows where the money really goes.",
    });
  }
  return rank(out);
}

export type AdminTipInput = {
  fmt: (n: number) => string;
  base: string;
  can: { people: boolean; sms: boolean; books: boolean; settings: boolean };
  /** people waiting to be let in */
  pendingJoins: number;
  /** payments made earlier that only an admin can confirm (the receiver has no app) */
  claimsForAdmin: number;
  /** people who owed a month ago, still owe, and paid nothing since */
  stale: { name: string; amount: number }[];
  /** people who owe and have no mobile number, so no SMS reaches them */
  noPhone: { name: string; amount: number }[];
  /** people who left the group with money still owed either way */
  leftWithBalance: number;
  owing: number;
  smsEnabled: boolean;
  smsFailed: number;
  /** last closed date, or null when the books were never closed */
  closedThrough: string | null;
  /** days from the last close (or the first entry) to today */
  daysOpen: number | null;
  autoClose: boolean;
};

const names = (list: { name: string }[]) => {
  const first = list.slice(0, 3).map((p) => p.name.split(" ")[0]);
  return list.length > 3 ? `${first.join(", ")} and ${list.length - 3} more` : first.join(first.length === 2 ? " and " : ", ");
};
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** Things an admin should act on, most pressing first. Each links to the page that fixes it. */
export function adminTips(t: AdminTipInput): Tip[] {
  const out: Tip[] = [];
  const admin = `${t.base}/admin`;
  if (t.pendingJoins > 0) {
    out.push({
      id: "joins",
      tone: "warn",
      title: `${people(t.pendingJoins)} waiting to join`,
      body: "They asked to join by an invite link that needs approval.",
      ...(t.can.people ? { href: `${admin}/people`, cta: "Review" } : {}),
    });
  }
  if (t.claimsForAdmin > 0) {
    out.push({
      id: "claims",
      tone: "warn",
      title: `${t.claimsForAdmin} ${t.claimsForAdmin === 1 ? "payment is" : "payments are"} waiting to be confirmed`,
      body: "Paid to someone without the app, so an admin confirms it. It only counts once confirmed.",
      href: t.base,
      cta: "Confirm on Home",
    });
  }
  if (t.smsFailed > 0) {
    out.push({
      id: "sms-failed",
      tone: "warn",
      title: `${t.smsFailed} SMS failed this week`,
      body: "Those people didn't get their total. The log shows why.",
      ...(t.can.sms ? { href: `${admin}/sms`, cta: "Open the SMS log" } : {}),
    });
  }
  if (t.stale.length > 0) {
    const total = t.stale.reduce((s, p) => s + p.amount, 0);
    out.push({
      id: "stale",
      tone: "warn",
      title: t.stale.length === 1 ? `${t.stale[0].name.split(" ")[0]} has owed for over a month` : `${t.stale.length} people have owed for over a month`,
      body:
        t.stale.length === 1
          ? `${t.fmt(round2(total))} was already owed a month ago, and there has been no payment since.`
          : `${names(t.stale)}: ${t.fmt(round2(total))} between them, with no payment in the last 30 days.`,
      ...(t.can.sms ? { href: `${admin}/sms`, cta: "Send a reminder" } : {}),
    });
  }
  if (t.noPhone.length > 0 && t.smsEnabled) {
    out.push({
      id: "no-phone",
      tone: "warn",
      title: `${people(t.noPhone.length)} who ${t.noPhone.length === 1 ? "owes has" : "owe have"} no mobile number`,
      body: `${names(t.noPhone)} can't get the SMS with their total.`,
      ...(t.can.people ? { href: `${admin}/people`, cta: "Add a number" } : {}),
    });
  }
  if (!t.smsEnabled && t.owing > 0) {
    out.push({
      id: "sms-off",
      tone: "info",
      title: "The SMS is switched off",
      body: `${people(t.owing)} owe money and nobody gets a reminder. You can still send one by hand.`,
      ...(t.can.settings ? { href: `${admin}/settings`, cta: "Open settings" } : {}),
    });
  }
  if (t.daysOpen !== null && t.daysOpen >= 35 && !t.autoClose) {
    out.push({
      id: "books",
      tone: "info",
      title: t.closedThrough ? `Books were last closed up to ${fmtDay(t.closedThrough)}` : "The books have never been closed",
      body: "Closing a finished week locks old entries, so the amounts people were told can't change later. Auto close does it every billing day.",
      ...(t.can.books ? { href: `${admin}/books`, cta: "Close books" } : {}),
    });
  }
  if (t.leftWithBalance > 0) {
    out.push({
      id: "left",
      tone: "info",
      title: `${people(t.leftWithBalance)} who left still ${t.leftWithBalance === 1 ? "has" : "have"} a balance`,
      body: "They are marked Left in the list below. Their history stays, and a payment can still be recorded for them.",
    });
  }
  return out;
}

const ORDER: Record<Tone, number> = { warn: 0, good: 1, info: 2 };

/** Warnings first, then good news, then the rest; the order inside each stays as written. */
function rank(tips: Tip[]) {
  return tips.map((t, i) => ({ t, i })).sort((a, b) => ORDER[a.t.tone] - ORDER[b.t.tone] || a.i - b.i).map((x) => x.t);
}
