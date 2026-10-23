// What a role can allow. Roles live in the database (org_roles); code only ever checks these keys.
export const PERMISSIONS = [
  { key: "expense.add", label: "Add expenses", hint: "Add and split costs, and create budgets" },
  { key: "expense.edit_any", label: "Edit any expense", hint: "Without it: only ones you added or paid" },
  { key: "settle.record_any", label: "Record any payment", hint: "Payments between two other people" },
  { key: "meals.order_for_others", label: "Order for others", hint: "Enter or fix anyone's meal order" },
  { key: "meals.manage_menu", label: "Manage the menu", hint: "Daily menu, prices, who paid, and the packing list" },
  { key: "budgets.manage", label: "Manage budgets", hint: "Edit and close any budget" },
  { key: "circles.manage", label: "Manage circles", hint: "Create circles and change who is in them" },
  { key: "members.invite", label: "Invite people", hint: "Invite links and SMS-only guests" },
  { key: "members.manage", label: "Manage members", hint: "Approve joins, change roles, deactivate" },
  { key: "sms.send", label: "Send the weekly SMS", hint: "Preview and send bills" },
  { key: "settings.manage", label: "Group settings", hint: "Modules, categories, meal slots, billing" },
  { key: "books.close", label: "Close the books", hint: "Freeze balances up to a date so they stop changing" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

const KEYS = new Set<string>(PERMISSIONS.map((p) => p.key));
export const isPermission = (x: string): x is Permission => KEYS.has(x);

/** Permissions that open the admin area (any one of them shows the Admin tab). */
export const ADMIN_PERMISSIONS: Permission[] = [
  "meals.manage_menu",
  "meals.order_for_others",
  "members.invite",
  "members.manage",
  "sms.send",
  "settings.manage",
  "books.close",
];
