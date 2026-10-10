# Multi-tenant Kotasa: design plan

Status: draft for Kavi's review (2026-10-10). Nothing here is built yet.

## Goal

Today Kotasa runs one office: one `settings` row, and every person shares one ledger. The goal is for
anyone to sign up, create a group (an office, friends, a trip, a family, a club), add people, and use
it fully isolated from every other group. One person can be in many groups. Each group can shape
Kotasa to fit: which modules it uses, its categories, its meal slots, and its permissions.

Pricing comes later. We first move the data model to multi-tenant and run Kavi's office on it. The
database has no real data yet (only Kavi's admin account), so this is the cheapest moment to change.

### Decisions made (2026-10-10)

- Any kind of group. Each group configures itself after creation.
- One person can belong to several groups.
- Public signup: Google and email OTP. Phone + PIN stays for people an admin adds.
- Pricing and billing: later. Keep a `plan` column so it can be added without another migration.
- Order: build the tenant model, use it in Kavi's office, then open signup.

## Core idea: account vs. member

The current `people` table mixes two things. We split it:

| Concept | Table | Scope | Example |
| --- | --- | --- | --- |
| **Profile**: a human who can log in | `profiles` | global | Kavi, with a Google login and a PIN login |
| **Member**: someone inside one group | `members` | one org | "Kavi" in *Agrithmics office*, "Kavi" in *Ella trip* |

- A member may have no profile. That is an SMS-only guest, as today.
- A profile can have many members, one per group.
- All money rows (expenses, shares, orders, settlements, SMS fees) point at **members**, never at
  profiles. Balances therefore never leak across groups.

## Schema

All new tables have RLS enabled with no policies, like today (see Isolation).

```sql
create type org_kind as enum ('office', 'friends', 'trip', 'family', 'club', 'other');
create type member_role as enum ('owner', 'admin', 'member');
create type member_status as enum ('active', 'pending', 'inactive');

create table profiles (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text unique,              -- verified (Google / email OTP)
  phone       text unique,              -- for phone+PIN login, 94XXXXXXXXX
  last_org_id uuid,                     -- where "/" sends you
  is_platform_admin boolean not null default false,  -- Kavi, for support later
  created_at  timestamptz not null default now()
);

create table profile_logins (            -- was person_logins
  auth_user_id uuid primary key references auth.users on delete cascade,
  profile_id   uuid not null references profiles on delete cascade,
  method       text not null check (method in ('pin', 'google', 'email'))
);

create table orgs (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,      -- used in URLs: /g/<slug>/...
  name       text not null,
  kind       org_kind not null default 'other',
  timezone   text not null default 'Asia/Colombo',
  currency   text not null default 'LKR',
  plan       text not null default 'free',
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);

create table members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs on delete cascade,
  profile_id  uuid references profiles on delete set null,   -- null = SMS-only guest
  display_name text not null,
  phone       text,                     -- for SMS in this group
  email       text,                     -- lets an invited person's signup link automatically
  role        member_role not null default 'member',
  status      member_status not null default 'active',
  view_token  text not null unique default left(replace(gen_random_uuid()::text,'-',''),24),
  created_at  timestamptz not null default now(),
  unique (org_id, id),                  -- target for composite FKs below
  unique (org_id, profile_id),
  unique (org_id, phone)
);
```

Every existing data table gets `org_id uuid not null references orgs on delete cascade`. Each person
reference becomes a **composite foreign key** through `members (org_id, id)`. For example:

```sql
alter table expenses
  add column org_id uuid not null references orgs on delete cascade,
  add foreign key (org_id, paid_by) references members (org_id, id);
alter table expense_shares
  add column org_id uuid not null,
  add foreign key (org_id, member_id) references members (org_id, id),
  add foreign key (org_id, expense_id) references expenses (org_id, id);  -- needs unique (org_id, id) on expenses
```

With composite keys the database rejects an expense in group A that names a member of group B, even
if the app code has a bug. Apply the same pattern to `orders`, `settlements`, `sms_logs`, `budgets`,
`menu_items`, and `expenses.budget_id`.

### Per-group configuration ("define it your way")

`settings` (the single row) becomes `org_settings`, one row per org, created with the org:

```sql
create table org_settings (
  org_id            uuid primary key references orgs on delete cascade,
  -- modules
  meals_enabled     boolean not null default false,  -- on by default only for kind = 'office'
  budgets_enabled   boolean not null default true,
  sms_enabled       boolean not null default false,
  -- permissions
  who_can_add       text not null default 'everyone' check (who_can_add in ('everyone','admins')),
  who_can_edit      text not null default 'involved' check (who_can_edit in ('involved','admins')),
  -- billing cycle and SMS (same columns as today)
  collector_id      uuid,               -- composite FK to members
  billing_weekday   int not null default 5,
  sms_send_hour     int not null default 15,
  sms_fee           numeric(10,2) not null default 2.00,
  sms_template      text not null default '...',
  updated_at        timestamptz not null default now()
);

create table org_categories (           -- replaces the hard-coded list in expense-form
  org_id uuid references orgs on delete cascade,
  key    text,                          -- 'ride', 'food', 'snacks', ...
  label  text not null,
  icon   text not null,                 -- Phosphor icon name from an allow-list
  sort   int not null default 0,
  archived boolean not null default false,
  primary key (org_id, key)
);

create table org_meal_slots (           -- replaces the breakfast/lunch enum
  org_id uuid references orgs on delete cascade,
  key    text,                          -- 'breakfast', 'lunch', 'tea', 'dinner'
  label  text not null,
  cutoff time not null,
  sort   int not null default 0,
  primary key (org_id, key)
);
```

`orders.meal` and `menu_items.meal` change from the `meal_type` enum to a `text` slot key with a
composite FK to `org_meal_slots`. A template per `org_kind` seeds categories and slots on creation.
For example, an office gets breakfast and lunch, and a trip gets fuel, stay and food categories.

### Ledger

- Every branch of the `ledger` view selects `org_id` too.
- `pair_balances(p_org uuid, p_until date)` filters `where org_id = p_org` before netting.
- `getPairs(orgId)`, `getLedgerFor(memberId, ...)` and `listMembers(orgId)` take the org explicitly.
- The rule still holds: never compute balances in JS from raw tables.

## Isolation

The app keeps today's model: the server uses the service-role client after permission checks. Three
layers keep groups apart:

1. **Composite foreign keys** (above): rows can't reference another group's members, at DB level.
2. **One org-scoped data layer.** A new `src/lib/org-db.ts` gives `orgDb(ctx)` with `select(table)`,
   which always adds `.eq('org_id', ctx.orgId)`, and `insert(table, row)`, which always sets
   `org_id`. Pages and actions stop calling `createAdminClient()` directly. There are 47 call sites
   today, and lint can then ban the raw client outside `src/lib/`.
3. **Before public launch: RLS policies.** Add `is_member(org_id)` and move reads to the user-scoped
   client, so a missed filter returns nothing instead of another group's data. Writes stay on the
   server.

Add an isolation test with two orgs and identical data. Log in as a member of A, hit every page and
action, and check that nothing from B appears. Extend the Playwright script used on 2026-10-10.

## Request context and routing

Group-scoped pages move under the group's slug:

```
/g/[slug]/              home (balances, today's meals, activity)
/g/[slug]/expenses ...  everything that is under (app)/ today
/g/[slug]/admin/...     group admin: members, settings, modules, categories, meal slots, invites
/                       redirects to the last group, or to /groups if you have none or several
/groups                 your groups + "Create a group"
/join/[code]            invite link
/b/[token]              public bill (member-level token, unchanged)
/login /signup          auth
```

- `requireMember(slug)` returns `{ profile, member, org, settings }`. It is cached per request and
  replaces `requireMember()`. `requireAdmin(slug)` checks `role in ('owner','admin')`.
- Server actions get the slug bound (`action.bind(null, slug)`) and run `requireMember(slug)` first.
  The slug only selects which membership to check, so you can only act where you are a member.
  Every row lookup must also match `member.org_id`.
- The group switcher in the header lists your memberships.
- Why the URL rather than an "active group" cookie: links stay shareable and correct, two tabs can
  show two groups, and each page states its group explicitly.

## Signup, invites, joining

- **Google:** the callback finds the profile by login. If there is none, it creates a profile, then
  links any `members` row whose `email` matches the verified email (an invited person lands in their
  group), then sends the user to `/groups`.
- **Email OTP:** `supabase.auth.signInWithOtp({ email })` with a 6-digit code. Profile creation is the
  same as Google.
- **Phone + PIN:** kept for people an admin adds. The phone is not verified, so PIN logins never
  auto-link by phone. Before public launch, add rate limiting on PIN attempts.
- **Invites** (`org_invites`: code, role, expires_at, max_uses, needs_approval). The admin shares
  `/join/<code>`. Joining creates a member, either active or pending approval.
- **Claiming a guest:** an admin can send a "claim" invite tied to an existing guest member, so that
  person's history and balance stay theirs when they sign up.
- The current "unknown Google account → pending → admin approves" flow becomes "join with approval"
  on an invite.

## Weekly SMS and cron

- The cron route loops over orgs where `sms_enabled`. For each it checks billing weekday and hour in
  `orgs.timezone`, then sends.
- `sms_logs` gets `org_id`. The fee rule becomes "first sent SMS per member per org per week".
- SMS costs real money, so it is the natural first paid feature later (credits per org). For now
  keep `plan`, and a hard per-org monthly SMS cap in settings as a safety net.

## Migrating today's data

One forward migration, written so it would also work on a database with real data:

1. Create the new tables.
2. Create org "Office" (name from `settings.office_name`, kind `office`) with slug `office`, which
   can be renamed later.
3. Move `people` with logins to `profiles` + `members`, and the rest to `members` only. Admins
   become `owner`/`admin`.
4. Move `settings` to `org_settings`, seed categories and meal slots from today's hard-coded lists,
   add `org_id` to every table, backfill, then swap the FKs to composite ones.
5. Rebuild `ledger` and `pair_balances`. Drop `people`, `person_logins`, `settings`.

Today this moves one account (Kavi). Test it on a local Postgres copy first, as the ledger SQL was.

## Phases

**Phase 1: tenant model, then use it in the office (next).**
Schema + migration, `orgDb`, `requireMember(slug)`, routes under `/g/[slug]`, group switcher, create
group, per-group settings (modules, categories, meal slots, permissions), invite links, per-org cron.
The isolation test passes. Deploy to Vercel and run Kavi's office on it.

**Phase 2: public signup.**
Email OTP, `/signup`, onboarding (create or join), guest claiming, a landing page.

**Phase 3: billing.**
Plans and limits, SMS credits, a payment provider. PayHere for LKR, or a merchant of record; confirm
Sri Lanka payouts and recurring billing before choosing.

**Phase 4: public launch hardening.**
RLS policies, PIN rate limits, privacy policy and terms (Sri Lanka PDPA), account and data deletion,
backups, error monitoring. Vercel Pro (Hobby is non-commercial only) and Supabase Pro.

## Open questions for Kavi

1. **"Define it your way": which knobs matter first?** This plan covers modules on/off, categories,
   meal slots with cutoffs, and who can add/edit. Anything else, for example custom roles, or
   sub-groups inside a group? Budgets already work as "pots" for an event inside a group.
2. **URL style:** is `/g/<group-name>/expenses` fine?
3. **Default modules per kind:** meals on for `office` only, budgets on for everyone, SMS off until an
   admin turns it on. OK?
4. **Leaving a group with a balance:** block it until settled, or allow it and keep them as inactive
   (their history stays)? Recommendation: allow, keep inactive, and show the balance to admins.
