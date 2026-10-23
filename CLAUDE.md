# Kotasa — project memory for Claude Code

@AGENTS.md

## Who and how
- Owner: Kavi (Kavishka Dinajara), Associate Software Engineer in Sri Lanka. Builds this for his own office.
- Credit: "Developed by Vimmik" (Kavi's small company, https://github.com/vimmik). Set in `BRAND.developer`
  (lib/brand.ts, logo `public/brand/vimmik.png`, 96px), shown by `<DevelopedBy />` on auth screens, Account and the public bill; also in metadata + package.json.
- Kavi writes in casual Sinhala-English ("Singlish"). Reply the same way, short and practical.
  Keep all UI copy, code, comments and commit messages in plain English.
- Ask before big product decisions (money rules, who-can-do-what). Small UI and code choices: just decide.

## What the app is
**Kotasa** (කොටස = "a share") — *Share it. Settle it.* Shared expenses for any group: an office (daily
breakfast/lunch orders, rides, cakes), friends, a trip, a family. Anyone can pay; the app tracks who owes
whom; a weekly SMS tells each person their total with a link to a read-only bill.
**Multi-tenant:** anyone signs in, creates or joins groups; groups are fully isolated; one person can be
in many groups. Design and decisions: `docs/multi-tenant-plan.md`.

Product decisions Kavi made (don't change without asking):
- **Not just meals.** Any expense ("Uber case") can be added and split. Meals are one module.
- **Anyone pays, app tracks** person-to-person debts (Splitwise-style), not a single central kitty.
- **Split:** equal (default) or custom amounts per person.
- **Who can do what** is per group: roles are named permission sets (`org_roles`); code checks
  permissions from `src/lib/permissions.ts`, never role names. Defaults: owner/admin = everything,
  member = add expenses + invite. Edit/delete an expense: creator, payer, or `expense.edit_any`.
- **Each group configures itself:** modules (meals, budgets) on/off for any group, own categories,
  own meal slots with cutoffs, billing day, SMS. Circles (sub-groups) and a role editor UI are phase 1b.
- **People without the app** are added by name + mobile. They get the weekly SMS and a read-only bill
  link showing where each amount came from. Registered users get more (ordering, adding, history…).
- **Budgets:** both plain expenses and budgets/funds with an optional limit.
- **Meals:** members order themselves AND admin can enter/fix anyone's order. Prices change daily (per-day menu).
  Orders lock at a cutoff time.
- **Weekly SMS:** on the last office day (configurable), scheduled + admin can send manually earlier.
  Scheduled run skips people already sent that week. An SMS fee is added to each person's bill once a week,
  owed to the collector.
- **Unpaid balances carry forward** automatically.
- **Login:** phone + 6-digit PIN (for people an admin adds), and Google. New people join a group by
  invite link (optionally needing approval) or get added by an admin. Leaving with a balance is allowed:
  member becomes inactive, history stays.
- **Themes:** System (default) / Light / Dark. Must be mobile responsive.

## Stack
- Next.js **16** App Router, React 19, TypeScript, Tailwind CSS v4 (CSS-first config in `globals.css`).
- Supabase (Postgres + Auth) via `@supabase/ssr` and `@supabase/supabase-js`.
- `@phosphor-icons/react` icons (import from `@phosphor-icons/react/ssr`, works in server + client components),
  `@fontsource-variable/geist` (self-hosted font, no Google Fonts fetch).
- UI polish follows the taste-skill `redesign-existing-projects` audit: `card-link` for clickable cards,
  `stagger` on page roots for entrance motion, global `:focus-visible` ring, squircle avatars.
- `src/components/ambient.tsx` (in the root layout) is a fixed background layer: gradient orbs, plus the logo's
  slices floating in the desktop gutters (xl+) with pointer parallax. Only transform/opacity animate, nothing
  moves on phones or with reduced motion. `body` must stay transparent (only `html` has the bg) or it hides this layer.
- Buttons are 3D (lit edge, lip, coloured shadow). `glass` + `bezel` utilities are for fixed-size surfaces only
  (auth screens). Don't put `backdrop-filter` on scrolling lists. Login/setup use `AuthShell`.
- Vercel hosting + Vercel Cron. SMS via Text.lk (Sri Lanka, pay-as-you-go, no monthly fee; Kavi chose it
  2026-10-10 over Notify.lk's Rs 3000 + monthly minimum). Notify.lk stays as `SMS_PROVIDER=notifylk`.
  Admin SMS page also has a free "Send on WhatsApp" (`wa.me`) link per person: no fee, not logged.

## Next.js 16 gotchas (this project hit all of these)
- Middleware is now **`src/proxy.ts`** exporting `proxy()`. Don't create `middleware.ts`.
- `cacheComponents: true` is on. Anything reading cookies/searchParams/params must be under a
  `<Suspense>` boundary. Pattern used: layouts render `<Suspense><Gate>{children}</Gate></Suspense>`
  where `Gate` is an async component that does the auth check.
- `cookies()`, `params`, `searchParams` are **async** — always `await`.
- Typed helpers `PageProps<"/route">` / `LayoutProps<"/route">` come from `next typegen`
  (runs during build/dev). If `tsc` says `Cannot find name 'PageProps'`, run `npx next typegen` first.
- After a mutation in a server action call `refresh()` from `next/cache` (no `use cache` is used anywhere).
- Dev mode validates instant navigation. A layout's `<Suspense>` doesn't cover client navigations
  between its child pages, so every segment with a layout has its own `loading.tsx`
  (`g/[slug]/` and `g/[slug]/admin/`). Add one when you add a new layout.
- `getAuthUserId()` calls `await connection()` before Supabase `getClaims()`, because `getClaims()` reads
  `Date.now()`, which is not allowed during prerender. Keep it.
- Read `node_modules/next/dist/docs/` before using an API you're unsure about.

## Tailwind v4 gotchas
- Custom classes are defined with `@utility` in `globals.css` (`card`, `btn`, `btn-primary`, `btn-ghost`,
  `btn-danger`, `input`, `label`, `pill`, `tbl`). `@apply` of a custom class only works between `@utility`s.
- Don't name a utility `table` (clashes with Tailwind's `table`) — that's why it's `tbl`.
- Colors are CSS variables exposed via `@theme inline`: `bg`, `surface`, `surface-2`, `ink`, `muted`, `line`,
  `brand`, `brand-ink`, `brand-soft`, `brand-strong`, `amber`, `amber-soft`, `amber-ink`, `danger`,
  `danger-soft`, `info-soft`, `info-ink`. Use these (`bg-surface`, `text-muted`…) — never raw hex in components,
  or dark mode breaks.

## Theming
- Light tokens on `:root`; dark tokens under `:root[data-theme="dark"]` AND
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`. Keep both blocks in sync.
- An inline script in `src/app/layout.tsx` applies the saved theme (localStorage `theme`) before paint.
- `src/components/theme-toggle.tsx` is the System/Light/Dark switch.

## Architecture
```
src/proxy.ts                 refresh Supabase session; logged-out -> /login (with ?next= for /g/ and /join/)
                             (public: /login /signup /setup /auth /b/); "/" -> /me when logged in
src/app/page.tsx             landing page for logged-out visitors (static). Logged-in people never see it.
                             Server-action redirects skip the proxy, so after login redirect to /me, never "/"
src/app/privacy, terms       public legal pages (needed for Google brand verification); contact = BRAND.contactEmail
src/app/signup/              Google sign-up (shows "not open yet" when NEXT_PUBLIC_GOOGLE_LOGIN=off)
src/app/welcome/             onboarding after a brand-new Google account (auth callback sends it here unless it
                             came from an invite): name, currency, income -> monthly main budget / create group /
                             join by link / skip. finishWelcome in actions/auth.ts
src/app/me/                  Me: private personal budgets (docs/personal-budget-plan.md). Today (safe to spend,
                             quick add), add, spending (+[id] edit), budgets (+new, [id]), settings (currency,
                             income, payday, categories, per-group feed + category mapping)
src/app/groups/              your groups, pending joins, create a group, "Across all your groups" (per-person net
                             over every shared group, lib/across.ts; same person = profile, else guest mobile/email)
src/app/join/[code]/         accept an invite link
src/app/g/[slug]/            one group (layout: requireMember(slug), group switcher, nav by modules/perms)
  page.tsx                   home: net balance, you owe / owes you, today's meals, activity
  expenses/ new/ [id]/       list (week + "involving me"/"everyone"), add, detail/edit (?edit=1)
  meals/                     weekly meal picker (module)
  budgets/ [id]/             budgets with limit + progress (module)
  settle/                    record a payment (?to=ID / ?from=ID &amount=)
  account/                   profile, theme, PIN, bill link, history, leave group
  guide/                     "How Kotasa works": idea, benefits, balance example, per-feature steps (only enabled
                             modules), admin note, FAQ. Linked from Home and Account. Keep it in sync with features.
  admin/                     packing, menu, orders, people (invites, approvals, roles), sms, settings;
                             tabs shown per permission (lib/admin-links.ts); /admin -> first allowed tab
src/app/b/[token]/           PUBLIC read-only bill for one member (from SMS), noindex
src/app/auth/callback/       Google: linked login -> done; else profile by verified email + claim invited members.
                             A signed `kotasa_link` cookie (Me › Settings "Connect Google") links it to that profile
                             Logins: Me › Settings "Sign-in" card sets number + PIN or connects Google. A Google
                             sign-up that already had a phone account joins it with number + PIN (welcome step 1 or
                             settings): mergeNewProfileInto (lib/accounts.ts), only while the new one has no Me data
src/app/login, setup         setup = first-run only (first account + first group)
src/app/api/cron/weekly-sms  Vercel cron (Bearer CRON_SECRET), loops groups with SMS on; ?force=1 ignores day/hour
src/app/actions/             ALL writes: auth.ts, expenses.ts, money.ts (settle, budgets), meals.ts, admin.ts,
                             personal.ts (Me; profile comes from the session only)
src/lib/
  auth.ts                    getCurrentProfile, requireMember(slug) -> OrgContext, can(), requirePermission,
                             requireMemberFromForm (hidden "org" field), requireModule, getMemberships
  org-db.ts                  orgDb(orgId): select/insert/update/delete always scoped to one group
  me-db.ts                   meDb(profileId): same idea for Me tables (personal_*), plus spend()/seed() RPCs
  personal.ts                getMe (seeds categories), getSpend, budgetStatus (periods, carry, safe-to-spend),
                             getHabits (quick-add chips), suggestBudget, getGroupFeeds
  periods.ts                 day/week/month/year/payday/custom ranges, closedPeriods for rollover
  quick-add.ts               one-line parser ("uber 1,200 yesterday"), category guess (history, then keywords)
  currency.ts                Me currencies, money(n, cur), currencyForCountry
  accounts.ts                createGroup, invites (find/accept), Google profile linking, cron group list
  org-config.ts              categories, meal slots, roles, invites, slugify/keyify, expense icon map
  permissions.ts             permission keys + labels
  ledger.ts                  listMembers, getPairs(orgId) (rpc pair_balances), summarize, getLedgerFor
  logins.ts                  PIN login create/update per profile; profileOwnedByOrg (who may reset a PIN)
  sms.ts                     buildWeeklyMessages, sendWeeklySms (per group, monthly cap), Text.lk / Notify.lk senders
  split.ts                   splitEqually (cent-exact)
  time.ts                    Asia/Colombo dates as "YYYY-MM-DD" strings, weeks start Monday
  phone.ts                   normalize to 94XXXXXXXXX, displayPhone, PIN email helper
  brand.ts                   BRAND name/tagline/colors, appUrl()
  types.ts                   shared types, rs() money formatter, round2
src/components/              UI (client components end in forms/pickers; bits.tsx = shared server bits)
                             org-field.tsx = hidden "org" input every group form needs
supabase/migrations/         init + multi_tenant (orgs, profiles/members, roles, circles, invites, composite FKs)
scripts/make-icons.mjs       regenerates logo/app icon set (uses sharp)
```

## Data model (Postgres, `public`)
- `profiles` — a human who can log in (global). `phone` (unique, PIN login), `email` (verified, unique),
  `last_org_id`. `profile_logins` — auth.users ↔ profiles, many-to-one. `method`: pin | google | email.
- `orgs` — a group: `slug` (URL), `name`, `kind`, `plan`. `org_settings` (one row per org): modules,
  collector_id, billing_weekday (1=Mon), sms_send_hour, sms_enabled, sms_fee, sms_monthly_cap, sms_template
  (must contain `{total}` and `{link}`). `org_roles` (key, label, permissions[]), `org_categories`,
  `org_meal_slots` (key, label, cutoff), `org_invites`, `circles` + `circle_members` (phase 1b UI).
- `members` — someone inside one group: `org_id`, `profile_id` (null = SMS-only guest), `role_key`,
  `status` active | pending | inactive, `phone` (SMS), `view_token` (24 hex, for `/b/<token>`).
- Money tables all have `org_id`: `expenses` + `expense_shares` (sum of shares = amount), `budgets`,
  `menu_items` (per date + meal slot), `orders` (one per member/date/slot; `payee_id` = collector at order
  time, item name/price snapshotted), `meal_payers` (who paid the vendor for one date + slot; set on the
  packing page; new orders take it as `payee_id`, else the collector). Shared meal items (family pack,
  drinks) are `expenses` with `meal_date` + `meal` set, split among who ate, paid by that meal's payer.
  **Shared-bill meals** (`org_meal_slots.pooled` default, `meal_days` per-day override): nobody picks an item;
  people join (`meal_joins`) and the bill (shared items) is split equally among them, re-split on every
  join change by `resplitMeal` (lib/meals.ts; custom-split bills are left alone). `settlements`, `sms_logs` (fee only on first *sent* SMS per member
  per week). Their person columns keep the old names (`person_id`, `paid_by`, `from_person`…) but point
  at `members`, through **composite FKs `(org_id, x) -> members (org_id, id)`**, so the DB itself rejects
  any cross-group reference.
- **One person, one member row per group.** Joining by invite takes over a guest with the same mobile/email
  (not on approval invites). `syncMemberContacts(profile)` copies the account's phone/email onto its member rows
  whenever they change. Leftover duplicates show "Same as X?" on People; `merge_members(org, from, to)` RPC moves
  all history (shares summed, self-payments dropped) and deletes the guest row.
- **Several payers:** `expense_copayers` (expense, member, amount) and `meal_copayers` (date, meal, member,
  payer_id, amount). The main payer (`paid_by` / the meal's payer) is still owed every share; each co-payer is owed
  their part by the main payer (extra ledger rows labelled "(paid part)"). `lib/payers.ts`: readCopayers (form rows
  `copayer_id` + `copayer_amount`), paidByEach, getExpenseCopayers.
- New groups: `create_org(...)` RPC (seeds roles, settings, categories, meal slots by kind, owner member).

**Me (personal)**: `profiles` has `currency`, `monthly_income`, `payday`, `plan`. Tables `personal_categories`,
`personal_category_map`, `personal_group_feed`, `personal_expenses`, `personal_budgets`, all keyed by `profile_id`.
`personal_spend(profile, from, to)` returns what you consumed: own entries + your expense shares, meal orders and
SMS fees from every group (not what you paid for others, not settlements). `counted=false` for groups in another
currency. All Me totals come from it. Nobody but the profile ever reads Me data.
Gotcha: identical Supabase GETs in one render are deduped by Next, so a re-read after a write in the same render
must differ (see getMe).

**Ledger** (view `public.ledger`): each row = `debtor owes creditor amount` inside one `org_id`, with
`source` (expense | meal | sms | settlement), `ref_id`, `label`, `entry_date`, `circle_id`.
A settlement A→B is stored as **B owes A** so it cancels A's debt.
`pair_balances(p_org, p_until, p_circle)` nets per pair → rows with positive amount. `group_balances` (same args)
is what `getPairs` calls: with `org_settings.simplify_debts` on (default, Settings › Modules "Fewest payments") and
no circle, it starts from pair_balances and shortens chains (X owes Y owes Z -> X pays Z) only when X and Z share a
ledger line or Z is the collector, so nobody is told to pay a stranger (20261016); else it returns pair_balances.
Never compute balances in JS from raw tables; use `getPairs(orgId)` / `summarize()`.

**Closing the books** (20261018, Admin › Close books, permission `books.close`): `close_books(org, through, by)` stores
`group_balances` at that date in `org_closings` + `org_closing_balances` (frozen, never recalculated). With a close in
force, `group_balances` = frozen balances, minus payments since between the same two people (they pay the frozen
amount first, so they change nobody else's), plus everything else since (simplified on its own), netted per pair.
Trigger `guard_closed_books` refuses any insert/update/delete of money rows dated on/before the close (`merge_members`
bypasses it with `kotasa.allow_closed`); actions check first with `closedError()` (lib/closing.ts) for a clear message.
Only an owner can reopen (deletes the latest close). `org_settings.auto_close`: the cron closes up to yesterday on the
billing day. The SMS fee is skipped for a week whose last day is closed.

## Security rules (keep these)
- RLS is enabled on every table with **no policies** → browser keys can read nothing. Advisor shows
  "RLS enabled no policy" as INFO; that's intentional.
- All data access is server-side with the service-role client, **after** `requireMember(slug)` and
  `can(ctx, ...)` checks. Group data goes through `orgDb(ctx.org.id)` only; eslint forbids
  `createAdminClient` in `src/app` and `src/components` except actions/auth.ts, actions/admin.ts and
  auth/callback (identity-level code). Every server action re-checks membership and permissions.
- Group forms post a hidden `org` (slug) via `<OrgField />`. It only selects which membership to check;
  never trust hidden fields for who the user is. Validate every id in a form against the group (orgDb).
- Not a member of a group (or no such group) = 404, so group slugs can't be probed.
- Nobody grants a permission they don't hold; only owners change owners; a group keeps ≥ 1 owner.
  An admin may set/reset a PIN only for a profile that lives entirely in their group (`profileOwnedByOrg`).
- `pair_balances` and `ledger` are revoked from anon/authenticated.
- PostgREST embeds: `members` → `orgs` must be written `orgs!members_org_id_fkey(*)`. A table whose primary key
  holds both `org_id` and a member FK (like `meal_joins`) counts as a second members↔orgs path, and a plain
  `orgs(*)` then fails with PGRST201 (the groups list goes empty). Check embeds after adding such a table.
- PIN logins use an internal email `<phone>@AUTH_EMAIL_DOMAIN`; look up the auth email via
  `auth.admin.getUserById` (don't rebuild it), since Google users may add a PIN later.
- `/b/[token]` is public by design; only show that member's data, from their own group.

## Commands
```bash
npm run dev
npx next typegen && npx tsc --noEmit   # type-check
npx eslint src
npm run build
node scripts/make-icons.mjs             # after changing the logo
```
Run typecheck + lint + build before saying something is done.

## Environment (.env.local, never commit)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key), `SUPABASE_SERVICE_ROLE_KEY`
(secret, server only), `NEXT_PUBLIC_APP_URL`, `AUTH_EMAIL_DOMAIN` (kotasa.local),
`NEXT_PUBLIC_GOOGLE_LOGIN` (`off` hides the button), `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (set: Google's own button +
`signInWithIdToken`, so the consent screen shows our domain; empty: Supabase redirect flow), `CRON_SECRET`, `SMS_PROVIDER`, `TEXTLK_API_KEY`,
`TEXTLK_SENDER_ID` (Notify.lk: `NOTIFY_USER_ID`, `NOTIFY_API_KEY`, `NOTIFY_SENDER_ID`). Template in `.env.example`.

## Databases (since 2026-10-11)
- **Prod**: Supabase `fmmsvvuxxctjovgksvqo` (official account). **QA**: `pxuahnbpuapsayariyxy`.
  **Dev**: `itutrhdrqrbvqkysnvdd` (the original project, Kavi's personal account; `.env.local` points here).
  Prod and QA were copied from dev on 2026-10-11, data and logins included.
- Migrations: while developing, apply a new file in `supabase/migrations/` to dev by hand. Prod gets it
  automatically: `.github/workflows/prod-db-migrations.yml` dry-runs on a PR into `main` and runs
  `supabase db push` on a push to `main` (secret `PROD_DB_URL` in the GitHub environment `production`,
  Session pooler URL). Only files not in prod's `supabase_migrations.schema_migrations` get applied.
- So a migration must be safe to run on live data, and the app code that ships with it must work
  before and after it runs (Vercel and the workflow deploy at the same time). Add things; don't
  rename or drop in the same release as the code change.
- Never write to the prod DB by hand without Kavi's explicit OK.

## Current status (2026-10-10)
Done:
- v2 app built; `next build`, tsc and eslint pass. Ledger/balance SQL tested on local Postgres
  (Uber + meals + payment case nets correctly).
- Supabase project **kotasa**, ref `itutrhdrqrbvqkysnvdd`, region ap-south-1, migration `init` applied.
- Runs locally against Supabase. First admin (Kavi) created via `/setup`. Supabase accepts the
  `kotasa.local` PIN email domain.
- Every screen tested end to end in headless Edge (mobile/desktop, light/dark). Covered: guest add,
  menu, meal order, equal split, edit, settle, budget, packing list, orders, public bill `/b/<token>`
  and a bad token (404). Test data was removed afterwards. Not exercised: Google login, SMS send,
  saving settings.

Direction (Kavi, 2026-10-10): Kotasa becomes multi-tenant. Anyone signs up and creates groups of any
kind, each group configures itself, one person can be in many groups, and pricing comes later. Plan:
`docs/multi-tenant-plan.md`. Phase 1 (tenant model) comes before the office starts using the app.
Read the plan before touching schema, auth or routes.

- Phase 1a (multi-tenant model) built on branch `multi-tenant`. Migration `multi_tenant` applied to
  Supabase on 2026-10-10 (Kavi is owner of group "Office", slug `office`). Full e2e run against the
  production build: 82/82 checks across 4 users and 3 groups (PIN users, guests, approval invites,
  guest claim, owner/admin/member/custom Treasurer roles, forged org/participant/edit requests,
  equal + custom splits, settle incl. "between others", budgets, meals + custom slot + module switch,
  categories, SMS dry run, leaving, owner protections, cross-group isolation). Test data removed.

- Me (personal budgets) phase A built on branch `feat/personal-budgets` (2026-10-11), migration `personal`
  applied. E2E 39/39 against the production build (first-visit seeding, quick add + undo, group feed, USD group
  not counted, monthly/daily-carry/custom budgets, safe-to-spend math, category mapping, feed off, income
  suggestion, edit/delete, 404, light/dark, 360px). Test data removed. Next: phase B (bills, goals, owed-to-you).

Not done yet / next steps:
0. Commit and merge `multi-tenant`. Phase 1b: role editor UI, circles UI. A "delete group" feature
   needs a `delete_org()` SQL function: deleting from `orgs` alone fails, because the cascade reaches
   `members` before `expense_shares`.
1. Deploy to Vercel (project not created yet), set all env vars, set `NEXT_PUBLIC_APP_URL`.
2. Supabase Auth → URL config: Site URL + redirect `<app>/auth/callback` (and localhost).
3. Google OAuth client → Supabase Google provider → set `NEXT_PUBLIC_GOOGLE_LOGIN=on`.
4. Text.lk: account (Vimmik) + API key done; test SMS via Admin → Weekly SMS → "Send test" delivered on
   2026-10-10 with `TextLKDemo` (plain, 1 unit). A real weekly run to 3 guests also went out (2 SMS parts each,
   bill link was still localhost). Unicode `type` is untested.
   **Test group:** "Vimmik" (slug `vimmik`, kind friends, SMS on) — Kavi (owner/collector) + guests Mahima, Mahesh,
   Vishwa (Vimmik teammates, real numbers). Keep it for testing; clear only its expenses/sms_logs after a test.
   Request sender ID "Kotasa" in the Text.lk portal (letter + NIC/BR), then set `TEXTLK_SENDER_ID`.

Ideas Kavi may want later (ask first): simplify debts across people, receipts/photos, notifications,
CSV export, Sinhala UI. Public signup (email OTP), billing/plans and launch hardening are phases 2–4 in the plan.

## Conventions
- Money: `numeric(12,2)` in DB, `round2()` in TS, format with `rs()`. Equal splits via `splitEqually` (cent-exact).
- Dates: always Colombo-local `YYYY-MM-DD` strings from `lib/time.ts`; don't use `new Date()` for "today".
- Forms: server action + `useActionState`, `SubmitButton`, `FormMessage`. Forms with typed fields use
  `<ActionForm action={...}>` (components/ui.tsx), not `<form action>`: React 19 resets uncontrolled
  fields after every form action, even one that returns an error, which wipes what the person typed. Validate on the server, return
  `{ error }` with a human sentence (what happened + what to do), sentence case, no "please".
- Mobile first: bottom nav is fixed, so page content has `pb-28` on mobile; sticky submit buttons sit at `bottom-20`.
- Accessibility: labels on every input, `aria-label` on icon-only buttons, `aria-current` on nav.
- Commit messages: short imperative subject, explain why in the body.
