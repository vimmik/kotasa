export type Meal = "breakfast" | "lunch";
export const MEALS: Meal[] = ["breakfast", "lunch"];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch" };

export type PersonStatus = "active" | "pending" | "inactive";

export type Person = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  is_admin: boolean;
  status: PersonStatus;
  view_token: string;
  created_at: string;
};

/** A person plus whether they can log in to the app. */
export type PersonWithLogin = Person & { registered: boolean };

export type Budget = {
  id: string;
  name: string;
  description: string | null;
  limit_amount: number | null;
  starts_on: string | null;
  ends_on: string | null;
  closed: boolean;
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
  split_type: "equal" | "custom";
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type ExpenseShare = { expense_id: string; person_id: string; amount: number };

export type MenuItem = {
  id: string;
  menu_date: string;
  meal: Meal;
  name: string;
  price: number;
  available: boolean;
};

export type Order = {
  id: string;
  person_id: string;
  order_date: string;
  meal: Meal;
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

export type Settings = {
  id: number;
  office_name: string;
  collector_id: string | null;
  breakfast_cutoff: string;
  lunch_cutoff: string;
  billing_weekday: number;
  sms_send_hour: number;
  sms_enabled: boolean;
  sms_fee: number;
  sms_template: string;
};

export type LedgerRow = {
  debtor: string;
  creditor: string;
  amount: number;
  entry_date: string;
  source: "expense" | "meal" | "sms" | "settlement";
  ref_id: string;
  label: string;
};

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

export const CATEGORIES = [
  { id: "food", label: "Food" },
  { id: "ride", label: "Ride" },
  { id: "shopping", label: "Shopping" },
  { id: "bills", label: "Bills" },
  { id: "fun", label: "Fun" },
  { id: "other", label: "Other" },
] as const;

export const rs = (n: number) =>
  `Rs. ${Number(n).toLocaleString("en-LK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const round2 = (n: number) => Math.round(n * 100) / 100;
