export type MemberStatus = "active" | "pending" | "inactive";

export type OrgKind = "office" | "friends" | "trip" | "family" | "club" | "other";
export const ORG_KINDS: { id: OrgKind; label: string; hint: string }[] = [
  { id: "office", label: "Office", hint: "Daily meals, rides, team treats" },
  { id: "friends", label: "Friends", hint: "Dinners, outings, shared bills" },
  { id: "trip", label: "Trip", hint: "Fuel, stay, tickets, food" },
  { id: "family", label: "Family", hint: "Groceries, bills, home costs" },
  { id: "club", label: "Club or team", hint: "Fees, kit, events" },
  { id: "other", label: "Something else", hint: "Any shared costs" },
];

/** A human who can log in. Global: one profile can be in many groups. */
export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  last_org_id: string | null;
  is_platform_admin: boolean;
  plan: string;
  /** Currency for Me (ISO code). Group shares in another currency aren't counted. */
  currency: string;
  monthly_income: number | null;
  /** Salary day 1-28, for "payday to payday" budgets */
  payday: number | null;
  created_at: string;
};

export type Org = {
  id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  timezone: string;
  currency: string;
  plan: string;
  created_at: string;
};

export type OrgSettings = {
  org_id: string;
  meals_enabled: boolean;
  budgets_enabled: boolean;
  circles_enabled: boolean;
  sms_enabled: boolean;
  collector_id: string | null;
  billing_weekday: number;
  sms_send_hour: number;
  sms_fee: number;
  sms_monthly_cap: number;
  sms_template: string;
  /** settle with the fewest payments (group_balances); missing before the 20261015 migration */
  simplify_debts?: boolean;
};

/** Someone inside one group. profile_id null = SMS-only guest. */
export type Member = {
  id: string;
  org_id: string;
  profile_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  role_key: string;
  status: MemberStatus;
  view_token: string;
  created_by: string | null;
  created_at: string;
};

/** A member plus whether they can log in to the app. */
export type MemberWithLogin = Member & { registered: boolean };

export type Role = { key: string; label: string; permissions: string[]; is_system: boolean; sort: number };
export type Category = { key: string; label: string; icon: string; sort: number; archived: boolean };
export type MealSlot = {
  key: string;
  label: string;
  cutoff: string;
  sort: number;
  archived: boolean;
  /** default mode: true = shared bill (people join, the bill is split equally), false = everyone orders */
  pooled: boolean;
};

export type Invite = {
  id: string;
  code: string;
  role_key: string;
  needs_approval: boolean;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  revoked: boolean;
  member_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type Budget = {
  id: string;
  name: string;
  description: string | null;
  limit_amount: number | null;
  starts_on: string | null;
  ends_on: string | null;
  closed: boolean;
  circle_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  paid_by: string;
  expense_date: string;
  budget_id: string | null;
  circle_id: string | null;
  /** set when this is a shared item for one meal slot on one day (family pack, drinks…) */
  meal_date: string | null;
  meal: string | null;
  split_type: "equal" | "custom";
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type ExpenseShare = { expense_id: string; person_id: string; amount: number };

/** Someone who paid part of a bill. The main payer paid the rest, and owes them this amount. */
export type Copayer = { member_id: string; amount: number };

export type MenuItem = {
  id: string;
  menu_date: string;
  meal: string; // meal slot key
  name: string;
  price: number;
  available: boolean;
};

export type Order = {
  id: string;
  person_id: string;
  order_date: string;
  meal: string; // meal slot key
  menu_item_id: string | null;
  item_name: string;
  unit_price: number;
  qty: number;
  payee_id: string | null;
};

export type Settlement = {
  id: string;
  from_person: string;
  to_person: string;
  amount: number;
  paid_on: string;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
};

export type LedgerRow = {
  org_id: string;
  debtor: string;
  creditor: string;
  amount: number;
  entry_date: string;
  source: "expense" | "meal" | "sms" | "settlement";
  ref_id: string;
  label: string;
  circle_id: string | null;
};

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

/** "Rs. 450" for whole rupees, "Rs. 247.50" otherwise (never "Rs. 247.5"). */
export const rs = (n: number) => {
  const cents = Math.round(Number(n) * 100) % 100 !== 0;
  return `Rs. ${Number(n).toLocaleString("en-LK", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Icon names a group can choose for a category (rendered by ICONS in components/bits). */
export const CATEGORY_ICON_NAMES = [
  "fork-knife",
  "car",
  "shopping-bag",
  "lightning",
  "gift",
  "receipt",
  "gas-pump",
  "bed",
  "ticket",
  "first-aid",
  "coffee",
  "house",
  "airplane",
  "moped",
  "users",
] as const;
