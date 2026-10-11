# Personal budgets ("Me"): design plan

Status: **approved by Kavi (2026-10-11).** Phase A built on branch `feat/personal-budgets` (migration
`personal` applied 2026-10-11, e2e 39/39). Phase B is next.

## Goal

Every person who logs in gets a private money space, **Me**, next to their groups. It answers one
question each morning: *how much can I spend today?* It should be faster and smarter than other
budget apps because Kotasa already knows most of what you spend: your share of every office lunch,
Uber and trip expense flows in by itself.

It is also the hook that brings people in alone. Someone can sign up only for their own budget, and
groups bring in their friends later. Groups pull people in and Me keeps them coming back.

### Decisions made (2026-10-11)

- Your share of group spending feeds into Me **automatically**. You can switch it off per group.
- **Me is the home screen**: `/` opens `/me`. Groups sit one tap away.
- v1 includes all four parts: budgets + periods, quick add + auto-feed, bills + goals, insights + bank SMS paste.
- Public signup (`/signup` with Google, onboarding, landing page) is built **alongside** this work.
  **Email OTP comes later.**
- **Income:** Kotasa asks for your take-home pay (optional) and suggests a main budget from it.
- **Currency:** each person picks the currency for Me. The default comes from their country.
  Group shares in a different currency are **not converted**: they show under "Other currencies"
  and don't count towards budgets.

## What the person sees

```
/me                Today: "Safe to spend today Rs 1,240", progress of each budget, bills due soon,
                   "friends owe you Rs 3,200", the last few entries, quick-add bar at the top
/me/add            Quick add (also a sheet opened from anywhere): "lunch 450", "uber 1200 yesterday"
/me/spending       Everything spent, by period and by category; group entries show the group name
/me/budgets        Budgets: list, add, edit (period, limit, categories, rollover)
/me/bills          Recurring bills with due dates; "Paid" records the expense
/me/goals          Savings pots with target + date and the amount to put away per day/week
/me/insights       Plain-words findings for this period
/me/settings       Categories, payday, per-group auto-feed switches
```

Bottom nav on `/me`: **Today · Spending · Add (centre) · Plan (budgets, bills, goals) · Groups**.
Inside a group, the existing nav gets a "Me" entry.

## Rules to approve

1. **Spending means what you consumed, not the cash you handed over.** If you pay Rs 5,000 for a
   lunch of 10 people, Me counts Rs 500 as your spending. The other Rs 4,500 shows as "owed to you",
   not as spending. Paying back a friend (a settlement) is not spending either: you only clear a debt.
   This keeps the budget honest no matter who paid on the day.
2. **What feeds in from a group:** your expense shares, your meal orders and your SMS fee. Each keeps
   its date, title and group name. Group categories map to your own categories (same key, else
   "Other"). You can change the mapping once and it sticks.
3. **Periods:** daily, weekly (Monday start, like the rest of the app), monthly, yearly,
   **payday** (from salary day N of the month to the day before the next one), or **custom**
   (a one-off date range, e.g. a trip or Avurudu).
4. **A budget** has a limit, a period and either "all spending" or a set of categories.
   The first budget you make is your main one and drives "safe to spend".
5. **Rollover**, chosen per budget:
   - *Off* (default): each period starts fresh.
   - *Carry*: whatever is left (or overspent) is added to (or taken from) the next period.
   - *To a goal*: whatever is left moves into a savings goal at the end of the period. Overspending
     is not taken back out of the goal.
6. **Safe to spend today** = (main budget limit + carry − spent before today − unpaid bills due
   before the period ends) ÷ days left (today included), minus what you already spent today. So the
   number goes down as you add today's spending, and tomorrow's share is worked out fresh. Never
   shown below zero; when it hits zero the card says so, or how much you are over the whole budget.
7. **Bills** repeat weekly, monthly or yearly (or once). Marking one paid records a personal expense.
   Unpaid bills count against "safe to spend" until they are paid. Reminders are in-app in v1.
8. **Goals:** target amount, optional date. Kotasa shows what to put away per day or week to make it.
   Money moved into a goal is not spending.
9. **Privacy:** Me is visible only to you. No group admin or member can see any of it. Guests without
   a login have no Me.
10. **Income and the suggested budget:** take-home pay per month is optional. The suggestion is
    income − monthly bills − what goals need per month, rounded down to a clean number. The person
    can always change it.
11. **Currency:** `profiles.currency` (ISO code). The default comes from the phone country code
    (94 → LKR) or, for Google signups, the `x-vercel-ip-country` header; otherwise LKR. A group's
    share feeds into Me only when `orgs.currency` matches. Other ones are listed separately, with no
    conversion. Changing the Me currency doesn't convert old entries, so the settings screen warns about that.
12. **Free vs Pro:** v1 is fully free. A `plan` column goes on `profiles` so limits can be added later
    without a migration. Likely Pro later: more than 3 budgets/goals, insights history, CSV export,
    receipt photos, a weekly summary by SMS/WhatsApp.

## Smart parts

- **Quick add** parses one line: amount, words, and an optional day (`yesterday`, `mon`, `12th`).
  The category comes from your own past entries with the same words first, then a keyword list
  (lunch, uber, pickme, keells, dialog, ceb…). Chips under the bar show your 6 most common entries
  for that time of day, so most adds are a single tap.
- **Bank SMS paste:** paste a card or debit alert and it fills amount, merchant and date. It parses
  the common Sri Lankan formats (ComBank, BOC, People's, Sampath, HNB, NSB, NTB, Seylan), with a
  generic "Rs/LKR amount + at MERCHANT" fallback. If the same amount, date and merchant is already
  there it warns about a duplicate. The text is parsed and then thrown away; it is never stored.
- **Insights** (rules, no AI in v1): this period against your average of the last 4, the category
  that moved most, the biggest single entry, the merchant you go to most, how many no-spend days you had,
  "at this pace you'll finish the month Rs X over/under". At most 3 shown, in plain words.
- **Owed to you / you owe**: totals across all your groups from the existing ledger, linking to each group.

## Data model

All tables are profile-scoped, RLS on with no policies (same as everything else). Access is server-side
through a `meDb(profileId)` helper that scopes every query, the way `orgDb(orgId)` does for groups.

```sql
alter table profiles add column plan text not null default 'free',
                     add column currency text not null default 'LKR',
                     add column monthly_income numeric(12,2),
                     add column payday smallint check (payday between 1 and 28);

create table personal_categories (profile_id, key, label, icon, sort, archived,  primary key (profile_id, key));
create table personal_category_map (profile_id, org_id, org_category, personal_key);   -- overrides only
create table personal_group_feed (profile_id, org_id, enabled boolean);                -- off switches

create table personal_expenses (
  id, profile_id, amount numeric(12,2) > 0, category, title, merchant, spent_on date,
  note, source text check (source in ('manual','quick','sms','bill')), bill_id, created_at);

create table personal_budgets (
  id, profile_id, name, amount numeric(12,2), is_main boolean,
  period text check (period in ('day','week','month','year','payday','custom')),
  starts_on date, ends_on date,            -- custom range, and where rollover counting starts
  categories text[],                        -- null = all spending
  rollover text check (rollover in ('off','carry','goal')), goal_id, archived);

create table personal_bills (id, profile_id, name, amount, category,
  repeat text check (repeat in ('once','week','month','year')), next_due date, remind_days smallint, active);
create table personal_bill_payments (bill_id, due_on date, expense_id, primary key (bill_id, due_on));

create table personal_goals (id, profile_id, name, icon, target numeric(12,2), target_date, archived);
create table personal_goal_moves (id, goal_id, profile_id, amount numeric(12,2), moved_on, note,
  source text check (source in ('manual','rollover')), budget_id, period_start date,
  unique (budget_id, period_start));        -- a period's rollover moves only once
```

**`personal_spend(p_profile, p_from, p_to)`** (SQL function, revoked from anon/authenticated) returns one row
per spending item: your manual expenses, plus your `expense_shares`, `orders` and sent `sms_logs`
through every `members` row with your `profile_id`, skipping groups switched off in `personal_group_feed`,
with the personal category already mapped. Every total in Me comes from this function. Like the
ledger rule, no totals are computed in JS from raw tables.

Rollover is computed, not stored: for a *carry* budget, walk the periods from `starts_on` to now and
add (limit − spent) per closed period. *To a goal* writes one `personal_goal_moves` row per closed
period, on the first visit after it closes (the unique key makes it safe to run twice).

## Signup alongside (phase 2 of the multi-tenant plan)

- `/signup` with Google. Email OTP comes later: it **needs custom SMTP**, because Supabase's built-in
  mail only sends a few emails per hour. Resend's free tier works for this.
- Onboarding after the first login: name → "What do you want to do first?" →
  *Track my own spending* (sets up a main budget in 2 taps) or *Split with a group* (create/join).
- A landing page at `/` for logged-out visitors (logged-in people go to `/me`).
- `/setup` (first-run only) stays as it is.

## Built in phase A (notes for later phases)

- Pages: `/me` (Today), `/me/add`, `/me/spending` (+ `[id]` edit), `/me/budgets` (+ `new`, `[id]`), `/me/settings`.
- Code: `lib/me-db.ts` (scoped access), `lib/personal.ts` (getMe, getSpend, budgetStatus, habits,
  suggestions, group feeds), `lib/periods.ts`, `lib/quick-add.ts` (parser), `lib/currency.ts`,
  `app/actions/personal.ts`.
- Categories are seeded on the first visit to Me (`seed_personal`).
- The "/" route now always opens `/me`. The group switcher has a "Me" entry, and /groups links to it.
- Not built yet: "owed to you" across groups, bills, goals, rollover into a goal (all phase B).

## Phases

| Phase | What ships | Done when |
| --- | --- | --- |
| **A** ✅ | Schema, `personal_spend`, `/me` Today, budgets (all periods, rollover off/carry), quick add, auto-feed + per-group switch, categories, `/` → `/me`, nav | Kavi's group shares show up in Me and safe-to-spend is right across a month boundary |
| **B** | Bills, goals, rollover to a goal, owed-to-you card | A bill paid and a goal funded change safe-to-spend correctly |
| **C** | Insights, bank SMS paste, spending page filters | 8 real SL bank alerts parse correctly |
| **S** | `/signup` (Google), onboarding, landing page. Email OTP + SMTP later | A new Google user signs up and lands in Me with a main budget |

S runs next to A–C. Each phase ends with tsc + eslint + build and an e2e run in headless Edge like phase 1a.
