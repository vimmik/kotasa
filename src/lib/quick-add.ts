// Quick add: turn one typed line ("lunch 450", "uber 1,200 yesterday", "2.5k keells sat") into an
// entry. Pure, so the browser can preview as you type and tests can run it anywhere.
import { addDays, isoWeekday } from "@/lib/time";

export type Parsed = {
  amount: number | null;
  title: string;
  date: string;
  /** Set when the line named a day, e.g. "Yesterday" */
  dateWord: string | null;
  category: string | null;
};

/** What you typed before -> the category you picked, newest first. Built from your own entries. */
export type History = { title: string; category: string }[];

const AMOUNT = /^(?:rs\.?|lkr|\$)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(k)?(?:\/-|\/=)?$/i;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const ORDINAL = /^(\d{1,2})(?:st|nd|rd|th)$/i;
const DAY_MONTH = /^(\d{1,2})[/.](\d{1,2})$/;

/**
 * Words that point to a category, for when your own history has no match yet. Sri Lankan shops
 * and services included. Keys are the default personal category keys.
 */
const KEYWORDS: Record<string, string[]> = {
  food: [
    "lunch", "dinner", "breakfast", "brunch", "tea", "coffee", "kottu", "rice", "buns", "bun", "shorteats",
    "snack", "snacks", "juice", "biriyani", "hoppers", "appa", "pittu", "roti", "parata", "pizza", "kfc",
    "mcdonalds", "burger", "cafe", "bakery", "cake", "ubereats", "food", "meal", "dosai", "icecream", "faluda",
  ],
  groceries: [
    "keells", "cargills", "arpico", "glomark", "spar", "laugfs", "grocery", "groceries", "veg", "vegetables",
    "fruit", "fruits", "fish", "chicken", "meat", "milk", "bread", "eggs", "pola", "market", "rice-bag",
  ],
  transport: [
    "uber", "pickme", "bus", "train", "tuk", "trishaw", "taxi", "cab", "fuel", "petrol", "diesel", "parking",
    "toll", "highway", "kangaroo", "ride", "service", "tyre", "bike",
  ],
  bills: [
    "dialog", "mobitel", "slt", "hutch", "airtel", "ceb", "leco", "electricity", "water", "wifi", "internet",
    "reload", "bill", "netflix", "spotify", "youtube", "insurance", "leasing", "loan", "fees", "subscription",
  ],
  shopping: ["clothes", "shirt", "shoes", "dress", "daraz", "odel", "nolimit", "fashion", "amazon", "aliexpress", "gift"],
  health: ["pharmacy", "medicine", "meds", "doctor", "channel", "channelling", "hospital", "osu", "lab", "dental", "gym"],
  fun: ["movie", "cinema", "scope", "game", "games", "party", "beer", "drinks", "outing", "concert", "ticket"],
  home: ["rent", "gas", "litro", "furniture", "repair", "repairs", "cleaning", "boarding", "annex"],
  travel: ["hotel", "villa", "airbnb", "flight", "trip", "booking"],
};

/** "1,200" -> 1200, "2.5k" -> 2500, "450/-" -> 450; null if it isn't an amount. */
export function readAmount(word: string): number | null {
  const m = AMOUNT.exec(word);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, "") + (m[2] ? `.${m[2]}` : ""));
  if (m[3]) n *= 1000;
  return n > 0 ? Math.round(n * 100) / 100 : null;
}

/** A day word -> date, or null. Days of the week mean the most recent one (today counts). */
function readDay(word: string, today: string): { date: string; label: string } | null {
  const w = word.toLowerCase().replace(/[.,]$/, "");
  if (w === "today") return { date: today, label: "Today" };
  if (w === "yesterday" || w === "yday" || w === "ystdy") return { date: addDays(today, -1), label: "Yesterday" };
  // "sat", "tues", "thursday": any prefix of a day name, 3 letters or more.
  const dayIdx = w.length >= 3 ? DAYS.findIndex((d) => fullDay(d).startsWith(w)) : -1;
  if (dayIdx >= 0) {
    const back = (isoWeekday(today) - (dayIdx + 1) + 7) % 7;
    const date = addDays(today, -back);
    return { date, label: back === 0 ? "Today" : back === 1 ? "Yesterday" : fullDay(DAYS[dayIdx]).replace(/^./, (c) => c.toUpperCase()) };
  }
  const [y, m, d] = today.split("-").map(Number);
  const ord = ORDINAL.exec(w);
  if (ord) {
    const day = Number(ord[1]);
    if (day < 1 || day > 31) return null;
    let date = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (day > d) date = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return valid(date) ? { date, label: fmt(date) } : null;
  }
  const dm = DAY_MONTH.exec(w);
  if (dm) {
    const day = Number(dm[1]);
    const mon = Number(dm[2]);
    if (mon < 1 || mon > 12) return null;
    let date = `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (date > today) date = `${y - 1}${date.slice(4)}`;
    return valid(date) ? { date, label: fmt(date) } : null;
  }
  return null;
}

function fullDay(d: string) {
  return { mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday", sun: "sunday" }[d]!;
}

function valid(d: string) {
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

function fmt(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Best category for this title: your own history first, then keywords. Only returns keys you have. */
export function guessCategory(title: string, history: History, have: Set<string>): string | null {
  const t = title.toLowerCase().trim();
  if (!t) return null;
  const words = t.split(/\s+/);
  const exact = history.find((h) => h.title.toLowerCase() === t && have.has(h.category));
  if (exact) return exact.category;
  const first = history.find((h) => h.title.toLowerCase().split(/\s+/)[0] === words[0] && have.has(h.category));
  if (first) return first.category;
  for (const [cat, list] of Object.entries(KEYWORDS)) {
    if (have.has(cat) && words.some((w) => list.includes(w.replace(/[^a-z-]/g, "")))) return cat;
  }
  return null;
}

export function parseQuick(line: string, today: string, history: History, have: Set<string>): Parsed {
  const words = line.trim().split(/\s+/).filter(Boolean);
  let date = today;
  let dateWord: string | null = null;

  // Each word is a day, an amount or part of the title. Only the first day word counts.
  const tokens = words.map((w) => {
    const d = dateWord ? null : readDay(w, today);
    if (d) {
      date = d.date;
      dateWord = d.label;
      return { w, kind: "day" as const, n: 0 };
    }
    const n = readAmount(w);
    return n === null ? { w, kind: "text" as const, n: 0 } : { w, kind: "amount" as const, n };
  });
  // "2 coffee 600": the biggest number is the amount; smaller ones stay in the title.
  const amounts = tokens.filter((t) => t.kind === "amount");
  const best = amounts.length ? amounts.reduce((a, b) => (b.n > a.n ? b : a)) : null;
  const amount = best ? best.n : null;
  const rest = tokens.filter((t) => t.kind === "text" || (t.kind === "amount" && t !== best)).map((t) => t.w);
  const raw = rest.join(" ").replace(/^(for|on|at)\s+/i, "");
  const title = raw ? raw[0].toUpperCase() + raw.slice(1) : "";
  return { amount, title, date, dateWord, category: guessCategory(title, history, have) };
}
