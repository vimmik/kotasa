<div align="center">

<img src="public/brand/app-icon-1024.png" alt="Kotasa logo" width="96" height="96" />

# Kotasa

**Share it. Settle it.**

Shared expenses for offices, friends, trips and families. Anyone pays, Kotasa keeps count,
and everyone settles once a week.

*කොටස (kotasa) means "a share" in Sinhala.*

![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![React 19](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

</div>

---

## Why Kotasa

In most offices and friend groups, one person buys lunch, another pays for the Uber, someone else
picks up the birthday cake. By Friday nobody remembers who owes whom.

Kotasa writes every shared cost down, splits it fairly, and nets it into one clear amount per person.
Each week, everyone gets an SMS with their total and a link that shows exactly where each rupee came from,
whether or not they use the app.

| Benefit | What it means |
| --- | --- |
| **No more "who paid?"** | Every cost records who paid and who it was for. |
| **Fair to the cent** | Equal splits are worked out exactly. Leftover cents never go missing. |
| **Fewer payments** | What you owe a person is netted against what they owe you. |
| **Works for everyone** | People without the app still get the weekly SMS and a read-only bill. |
| **Nothing gets lost** | Unpaid balances carry over to the next week automatically. |

## Features

### Expenses and settling

- Add any shared cost (meals, rides, cakes, trips) and choose who paid.
- Split equally, or enter a custom amount for each person.
- Record payments in one tap with *Settle* and *Got paid*.
- See a full history, with every amount traced back to its source.

### Meals (optional module)

- A daily menu with per-day prices, and meal slots with order cutoffs.
- Members order for themselves. Admins can enter or fix anyone's order.
- Shared-bill meals: people join, and the bill is split among whoever ate.
- A printable packing list for the person collecting the food.

### Budgets (optional module)

- Funds or plans with an optional limit and a progress bar.

### Weekly SMS

- Sent on each group's billing day, or sent early by an admin.
- Each message shows the person's total, who to pay, and a link to their bill.
- Preview every message before it goes out. Includes a monthly send limit and a full send log.
- A free *Send on WhatsApp* option opens WhatsApp with the message ready to send.

### Groups

- Anyone can create a group or belong to several. Each group's data is fully isolated.
- Join by invite link (with optional approval), or be added by an admin with a name and mobile number.
- Roles are named permission sets, such as owner, admin, member or a custom treasurer.
- Each group sets its own modules, categories, meal slots, billing day and SMS.

### Everywhere

- Sign in with phone and 6-digit PIN, or Google.
- System, light and dark themes. Mobile first, with a bottom tab bar on phones.
- A built-in *How Kotasa works* guide for new members.

## How balances work

Every expense share, meal order, SMS fee and payment becomes one ledger line: *A owes B an amount*.
The database function `pair_balances()` nets those lines for each pair of people, so the app can show
simple instructions such as "Pay Nimal Rs. 450". Every number can be traced back to the entries behind it.

A payment from A to B is stored as *B owes A*, which cancels A's debt.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, server actions), React 19, TypeScript |
| Styling | Tailwind CSS v4 (CSS-first config), Phosphor icons, self-hosted Geist font |
| Data and auth | Supabase: Postgres, Auth, row-level security |
| Hosting | Vercel, with Supabase pg_cron calling the weekly SMS route every hour |
| SMS | [Text.lk](https://text.lk) (Sri Lanka). Notify.lk is also supported. |

## Getting started

### Requirements

- Node.js 20 or later
- A Supabase project
- A Text.lk account, if you want to send SMS

### 1. Install and configure

```bash
git clone https://github.com/kavishkadinajara/kotasa.git
cd kotasa
npm install
cp .env.example .env.local   # then fill in the values below
```

### 2. Set up the database

Apply the SQL files in `supabase/migrations/` in filename order, either with the Supabase CLI
(`supabase db push`) or by running them in the SQL editor.

In Supabase, go to **Authentication → URL Configuration** and set:

- **Site URL:** your production URL
- **Redirect URLs:** `<your-app>/auth/callback` and `http://localhost:3000/auth/callback`

### 3. Run it

```bash
npm run dev
```

Open <http://localhost:3000/setup> to create the first account and the first group.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key. Server only, never expose it. |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app, used in bill links and sign-in redirects |
| `AUTH_EMAIL_DOMAIN` | Internal email domain for PIN logins (for example `kotasa.local`) |
| `NEXT_PUBLIC_GOOGLE_LOGIN` | `on` shows the Google button, `off` hides it |
| `CRON_SECRET` | Bearer token pg_cron sends to `/api/cron/weekly-sms` (also stored in Supabase Vault) |
| `SMS_PROVIDER` | `textlk` (default) or `notifylk` |
| `TEXTLK_API_KEY`, `TEXTLK_SENDER_ID` | Text.lk API token and approved sender ID |
| `NOTIFY_USER_ID`, `NOTIFY_API_KEY`, `NOTIFY_SENDER_ID` | Only needed when `SMS_PROVIDER=notifylk` |

`.env.example` has a template.

## Deployment

1. Import the repository into Vercel and add every environment variable above.
2. Set `NEXT_PUBLIC_APP_URL` to the production URL.
3. Supabase pg_cron calls `/api/cron/weekly-sms` every hour at :30 UTC (:00 in Sri Lanka). Each group is only
   messaged on its own billing day, from its send hour. In the Supabase SQL editor, store the URL and secret once:
   `select vault.create_secret('https://<app domain>', 'kotasa_app_url');` and
   `select vault.create_secret('<CRON_SECRET>', 'kotasa_cron_secret');`. Without them the job does nothing.

### Google sign-in (optional)

1. In Google Cloud Console, create an OAuth client (Web) with the redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase, go to **Authentication → Providers → Google**, paste the client ID and secret, and enable it.
3. Set `NEXT_PUBLIC_GOOGLE_LOGIN=on` and redeploy.

### SMS

1. Create a Text.lk account and copy the API token from **Developers**.
2. Set `TEXTLK_API_KEY`. Use `TEXTLK_SENDER_ID=TextLKDemo` until your own sender ID is approved.
3. In the app, go to **Admin → Weekly SMS** and press **Send test**. This sends one SMS to your own number.
4. Turn SMS on in **Admin → Settings**. Until then, every send is logged as a dry run.

## Security

- Row-level security is on for every table, with no public policies. Browser keys cannot read any data.
- All reads and writes run on the server, after checking group membership and permissions.
- Composite foreign keys stop any record from pointing at a member of a different group.
- People who aren't in a group get a 404 for it, so group addresses can't be probed.
- The public bill page (`/b/<token>`) shows one member's data only, and is excluded from search engines.

## Project structure

```text
src/proxy.ts                session refresh and login redirect
src/app/
  groups/  join/[code]/     your groups, create a group, accept an invite
  g/[slug]/                 one group: home, expenses, meals, budgets, settle, account, guide, admin
  b/[token]/                public read-only bill
  api/cron/weekly-sms/      scheduled weekly SMS
  actions/                  server actions: every write, each with permission checks
src/lib/                    auth, ledger, SMS, permissions, group config, dates, money helpers
src/components/             UI components
supabase/migrations/        schema, ledger view, pair_balances(), RLS
```

## Scripts

```bash
npm run dev                              # start the dev server
npx next typegen && npx tsc --noEmit     # type-check
npx eslint src                           # lint
npm run build                            # production build
node scripts/make-icons.mjs              # regenerate app icons after changing the logo
```

## Roadmap

- Role editor and circles (sub-groups) in the UI
- Public sign-up
- Plans and billing for groups

---

<div align="center">

<a href="https://github.com/vimmik"><img src="public/brand/vimmik.png" alt="Vimmik logo" width="40" height="40" /></a>

Built by **[Vimmik](https://github.com/vimmik)**

© 2026 Vimmik. All rights reserved.

</div>
