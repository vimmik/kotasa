# Kotasa — project memory for Claude Code

@AGENTS.md

## Who and how
- Owner: Kavi (Kavishka Dinajara), Associate Software Engineer in Sri Lanka. Builds this for his own office.
- Kavi writes in casual Sinhala-English ("Singlish"). Reply the same way, short and practical.
  Keep all UI copy, code, comments and commit messages in plain English.
- Ask before big product decisions (money rules, who-can-do-what). Small UI and code choices: just decide.

## What the app is
**Kotasa** (කොටස = "a share") — *Share it. Settle it.* Shared office expenses: daily breakfast/lunch
orders, rides, cakes, trips, anything. Anyone can pay; the app tracks who owes whom; a weekly SMS tells
each person their total with a link to a read-only bill.

Product decisions Kavi made (don't change without asking):
- **Not just meals.** Any expense ("Uber case") can be added and split. Meals are one module.
- **Anyone pays, app tracks** person-to-person debts (Splitwise-style), not a single central kitty.
- **Split:** equal (default) or custom amounts per person.
- **Who adds expenses:** any registered member. Edit/delete: creator, payer, or admin.
- **People without the app** are added by name + mobile. They get the weekly SMS and a read-only bill
  link showing where each amount came from. Registered users get more (ordering, adding, history…).
- **Budgets:** both plain expenses and budgets/funds with an optional limit.
- **Meals:** members order themselves AND admin can enter/fix anyone's order. Prices change daily (per-day menu).
  Orders lock at a cutoff time.
- **Weekly SMS:** on the last office day (configurable), scheduled + admin can send manually earlier.
  Scheduled run skips people already sent that week. An SMS fee is added to each person's bill once a week,
  owed to the collector.
- **Unpaid balances carry forward** automatically.
- **Login:** phone + 6-digit PIN, and Google. Unknown Google accounts become *pending*; admin approves
  (link to an existing person, or approve as new with a mobile number).
- **Themes:** System (default) / Light / Dark. Must be mobile responsive.

## Stack
- Next.js **16** App Router, React 19, TypeScript, Tailwind CSS v4 (CSS-first config in `globals.css`).
- Supabase (Postgres + Auth) via `@supabase/ssr` and `@supabase/supabase-js`.
- `lucide-react` icons, `@fontsource-variable/plus-jakarta-sans` (self-hosted font, no Google Fonts fetch).
- Vercel hosting + Vercel Cron. SMS via Notify.lk (Sri Lanka).

## Next.js 16 gotchas (this project hit all of these)
- Middleware is now **`src/proxy.ts`** exporting `proxy()`. Don't create `middleware.ts`.
- `cacheComponents: true` is on. Anything reading cookies/searchParams/params must be under a
  `<Suspense>` boundary. Pattern used: layouts render `<Suspense><Gate>{children}</Gate></Suspense>`
  where `Gate` is an async component that does the auth check.
- `cookies()`, `params`, `searchParams` are **async** — always `await`.
- Typed helpers `PageProps<"/route">` / `LayoutProps<"/route">` come from `next typegen`
  (runs during build/dev). If `tsc` says `Cannot find name 'PageProps'`, run `npx next typegen` first.
- After a mutation in a server action call `refresh()` from `next/cache` (no `use cache` is used anywhere).
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
src/proxy.ts                 refresh Supabase session; redirect logged-out users to /login
                             (public: /login /setup /auth /b/)
src/app/(app)/               everything behind login (layout does requireMember)
  page.tsx                   home: net balance, you owe / owes you, today's meals, activity
  expenses/ new/ [id]/       list (week + "involving me"/"everyone"), add, detail/edit (?edit=1)
  meals/                     weekly meal picker
  budgets/ [id]/             budgets with limit + progress
  settle/                    record a payment (?to=ID / ?from=ID &amount=)
  account/                   profile, theme, PIN, bill link, history
  admin/                     packing list, menu, orders, people (+ pending approvals), sms, settings
src/app/b/[token]/           PUBLIC read-only bill (from SMS), noindex
src/app/auth/callback/       Google OAuth: link existing → match by email → first-ever = admin → else pending
src/app/login, setup, pending
src/app/api/cron/weekly-sms  Vercel cron (Bearer CRON_SECRET); ?force=1 ignores day/hour
src/app/actions/             ALL writes: auth.ts, expenses.ts, money.ts (settle, budgets), meals.ts, admin.ts
src/lib/
  auth.ts                    getCurrentPerson (react cache), requireMember, requireAdmin, getSettings
  ledger.ts                  listPeople, getPairs (rpc pair_balances), summarize, getLedgerFor
  logins.ts                  PIN login create/update, phone sync, delete logins
  sms.ts                     buildWeeklyMessages, sendWeeklySms, Notify.lk sender
  split.ts                   splitEqually (cent-exact)
  time.ts                    Asia/Colombo dates as "YYYY-MM-DD" strings, weeks start Monday
  phone.ts                   normalize to 94XXXXXXXXX, displayPhone, PIN email helper
  brand.ts                   BRAND name/tagline/colors, appUrl()
  types.ts                   shared types, rs() money formatter, round2
src/components/              UI (client components end in forms/pickers; bits.tsx = shared server bits)
supabase/migrations/         single init migration (schema, ledger view, pair_balances, RLS)
scripts/make-icons.mjs       regenerates logo/app icon set (uses sharp)
```

## Data model (Postgres, `public`)
- `people` — everyone who can owe/be owed. `status`: active | pending | inactive. `phone` (94XXXXXXXXX,
  unique, needed for SMS), `email` (lowercase, unique, used to match Google), `is_admin`,
  `view_token` (24 hex, for `/b/<token>`).
- `person_logins` — auth.users ↔ people, many-to-one. `method`: pin | google. A person with no rows is
  an "SMS only" guest.
- `expenses` + `expense_shares` (sum of shares = amount). `budgets` (optional `limit_amount`, dates, closed).
- `menu_items` (per date + meal, price), `orders` (one per person/date/meal; `payee_id` = collector at order time,
  item name/price snapshotted).
- `settlements` (from_person paid to_person). `sms_logs` (fee only on first *sent* SMS per person per week).
- `settings` (single row id=1): office_name, collector_id, cutoffs, billing_weekday (1=Mon), sms_send_hour,
  sms_enabled, sms_fee, sms_template (must contain `{total}` and `{link}`).

**Ledger** (view `public.ledger`): each row = `debtor owes creditor amount`, with `source`
(expense | meal | sms | settlement), `ref_id`, `label`, `entry_date`.
A settlement A→B is stored as **B owes A** so it cancels A's debt.
`pair_balances(p_until)` nets per pair → rows with positive amount. Never compute balances in JS from raw
tables; use `getPairs()` / `summarize()`.

## Security rules (keep these)
- RLS is enabled on every table with **no policies** → browser keys can read nothing. Advisor shows
  "RLS enabled no policy" as INFO; that's intentional.
- All data access is server-side with the service-role client (`createAdminClient()`), **after**
  `requireMember()` / `requireAdmin()` and explicit ownership checks. Every server action re-checks
  permissions; never trust hidden form fields for who the user is.
- `pair_balances` and `ledger` are revoked from anon/authenticated.
- PIN logins use an internal email `<phone>@AUTH_EMAIL_DOMAIN`; look up the auth email via
  `auth.admin.getUserById` (don't rebuild it), since Google users may add a PIN later.
- `/b/[token]` is public by design; only show that person's data.

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
`NEXT_PUBLIC_GOOGLE_LOGIN` (`off` hides the button), `CRON_SECRET`, `NOTIFY_USER_ID`, `NOTIFY_API_KEY`,
`NOTIFY_SENDER_ID`. Template in `.env.example`.

## Current status (2026-10-10)
Done:
- v2 app built; `next build`, tsc and eslint pass. Ledger/balance SQL tested on local Postgres
  (Uber + meals + payment case nets correctly).
- Supabase project **kotasa**, ref `itutrhdrqrbvqkysnvdd`, region ap-south-1, migration `init` applied.

Not done yet / next steps:
1. Put `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, run locally, create first admin at `/setup`,
   and click through every screen (never tested in a real browser against Supabase).
2. Deploy to Vercel (project not created yet), set all env vars, set `NEXT_PUBLIC_APP_URL`.
3. Supabase Auth → URL config: Site URL + redirect `<app>/auth/callback` (and localhost).
4. Google OAuth client → Supabase Google provider → set `NEXT_PUBLIC_GOOGLE_LOGIN=on`.
5. Notify.lk keys; verify their current API in `src/lib/sms.ts` (`sendViaNotifyLk`) before enabling SMS.
6. Check that Supabase accepts the `kotasa.local` email domain for PIN users; if `createUser` rejects it,
   change `AUTH_EMAIL_DOMAIN` (e.g. a subdomain you own).

Ideas Kavi may want later (ask first): simplify debts across people, receipts/photos, groups beyond one
office, notifications, CSV export, Sinhala UI.

## Conventions
- Money: `numeric(12,2)` in DB, `round2()` in TS, format with `rs()`. Equal splits via `splitEqually` (cent-exact).
- Dates: always Colombo-local `YYYY-MM-DD` strings from `lib/time.ts`; don't use `new Date()` for "today".
- Forms: server action + `useActionState`, `SubmitButton`, `FormMessage`. Validate on the server, return
  `{ error }` with a human sentence (what happened + what to do), sentence case, no "please".
- Mobile first: bottom nav is fixed, so page content has `pb-28` on mobile; sticky submit buttons sit at `bottom-20`.
- Accessibility: labels on every input, `aria-label` on icon-only buttons, `aria-current` on nav.
- Commit messages: short imperative subject, explain why in the body.
