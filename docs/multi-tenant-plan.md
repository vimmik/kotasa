# Multi-tenant Kotasa: design plan

Status: approved by Kavi (2026-10-10). Open questions answered; see Decisions. Phase 1a is next.

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
- Groups get **custom roles** (named permission sets) and **circles** (sub-groups of members inside a
  group). Both are designed below.
- URLs look like `/g/<group-slug>/...`.
- Every module, meals included, can be switched on by any group. Defaults depend on the group kind.
- Someone with a balance can still leave a group. They become inactive, their history stays, and
  admins see what is still owed.

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
  role_key    text not null default 'member',  -- composite FK (org_id, role_key) -> org_roles
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
  -- modules: any group can switch any of these on; defaults come from the kind template
  meals_enabled     boolean not null default false,  -- template turns it on for 'office'
  budgets_enabled   boolean not null default true,
  circles_enabled   boolean not null default true,
  sms_enabled       boolean not null default false,  -- off until an admin turns it on
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

### Custom roles

A role is a named set of permissions inside a group. Code checks **permissions**, never role names.

```sql
create table org_roles (
  org_id      uuid references orgs on delete cascade,
  key         text,                      -- 'owner', 'admin', 'member', 'treasurer', 'canteen', ...
  label       text not null,
  permissions text[] not null default '{}',
  is_system   boolean not null default false,  -- owner/admin/member: can't be deleted
  sort        int not null default 0,
  primary key (org_id, key)
);
```

Permission list (fixed in code in `src/lib/permissions.ts`, so a typo can't grant anything):

| Permission | Lets you |
| --- | --- |
| `expense.add` | add expenses |
| `expense.edit_any` | edit/delete any expense (without it: only ones you created or paid) |
| `settle.record_any` | record a payment between two other people |
| `meals.order_for_others` | enter or fix anyone's meal order |
| `meals.manage_menu` | edit the daily menu and see the packing list |
| `budgets.manage` | create, edit and close budgets |
| `circles.manage` | create circles and change who is in them |
| `members.invite` | create invite links, add SMS-only guests |
| `members.manage` | approve joins, change roles, deactivate people |
| `sms.send` | preview and send the weekly SMS |
| `settings.manage` | modules, categories, meal slots, billing day, roles |

- System roles are seeded per group. **owner** has everything, can't be edited and can't be removed
  from the last owner. **admin** starts with everything except changing the owner. **member** starts
  with `expense.add`.
- Admins can create roles such as "Treasurer" (`settle.record_any`, `sms.send`) or "Canteen"
  (`meals.manage_menu`, `meals.order_for_others`) and edit the permissions of every role except owner.
- Nobody can grant a permission they don't hold, and the last owner can't be demoted.
- `requireMember(slug)` loads the member's permission set once per request. `can(ctx, "sms.send")`
  checks a permission and `requirePermission(ctx, ...)` enforces one in actions.

### Circles (sub-groups)

A circle is a named set of members inside a group, for example "Lunch crew", "Finance team" or "Ella
trip" inside an office. Circles don't split the money. All balances still net across the whole
group, because a debt between Kavi and Nimal is one debt.

```sql
create table circles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs on delete cascade,
  name        text not null,
  icon        text not null default 'users',
  visibility  text not null default 'group' check (visibility in ('group', 'circle')),
  created_by  uuid,                      -- composite FK to members
  created_at  timestamptz not null default now(),
  unique (org_id, id)
);
create table circle_members (
  org_id     uuid not null,
  circle_id  uuid not null,
  member_id  uuid not null,
  primary key (circle_id, member_id),
  foreign key (org_id, circle_id) references circles (org_id, id) on delete cascade,
  foreign key (org_id, member_id) references members (org_id, id) on delete cascade
);
-- expenses.circle_id and budgets.circle_id: optional, composite FK to circles
```

What circles do:

- **Quick split:** in the expense form, "Split with: Lunch crew" ticks exactly that circle's members.
- **Filter:** the expenses list and activity can show a single circle. The circle page shows what
  was spent in it and the balances from its expenses only (`pair_balances(p_org, p_until, p_circle)`).
- **Budgets:** a budget can belong to a circle (for example "Ella trip" with a Rs. 60,000 limit).
- **Visibility:** `group` circles are seen by everyone in the group. For `circle` visibility, only
  its members (and holders of `circles.manage`) see its expenses in the lists. Balances still include
  them, because the people in an expense are always members of that circle.

Not in circles (yet): separate meal menus per circle, nested circles, separate billing.

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

- `requireMember(slug)` returns `{ profile, member, org, settings, permissions }`. It is cached per
  request and replaces `requireMember()`. `requireAdmin()` goes away; pages and actions call
  `requirePermission(ctx, "...")` instead (see Custom roles).
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
3. Move `people` with logins to `profiles` + `members`, and the rest to `members` only. Seed the
   system roles. The first admin becomes `owner`, other admins `admin`, everyone else `member`.
4. Move `settings` to `org_settings`, seed categories and meal slots from today's hard-coded lists,
   add `org_id` to every table, backfill, then swap the FKs to composite ones.
5. Rebuild `ledger` and `pair_balances`. Drop `people`, `person_logins`, `settings`.

Today this moves one account (Kavi). Test it on a local Postgres copy first, as the ledger SQL was.

## Phases

**Phase 1a: tenant model and roles, then use it in the office (next).**
The full schema and migration, including the circles tables, so there is only one migration.
`orgDb`, `requireMember(slug)`, permissions and system roles, and routes under `/g/[slug]`. Group
switcher and create group. Per-group settings: modules, categories, meal slots, billing day. Invite
links, per-org cron. The isolation test must pass. Then deploy to Vercel and run Kavi's office on it.

**Phase 1b: custom roles UI and circles UI.**
Role editor (create, rename, tick permissions). Circles: create, members, quick split, filter,
circle budgets, visibility.

**Phase 2: public signup.**
Email OTP, `/signup`, onboarding (create or join), guest claiming, a landing page.

**Phase 3: billing.**
Plans and limits, SMS credits, a payment provider. PayHere for LKR, or a merchant of record; confirm
Sri Lanka payouts and recurring billing before choosing.

**Phase 4: public launch hardening.**
RLS policies, PIN rate limits, privacy policy and terms (Sri Lanka PDPA), account and data deletion,
backups, error monitoring. Vercel Pro (Hobby is non-commercial only) and Supabase Pro.

## Answered questions (2026-10-10)

1. Which knobs: everything above, plus custom roles and sub-groups (circles).
2. URL style `/g/<group-slug>/...`: yes.
3. Modules: any group can turn on any module, meals included. Kind templates only set defaults.
4. Leaving with a balance: allowed. The member becomes inactive, history stays, admins see the
   balance.
