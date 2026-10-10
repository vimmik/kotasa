# Kotasa — Share it. Settle it.

*කොටස (kotasa) = "a share" in Sinhala.*

Shared office expenses in one place: daily breakfast/lunch orders, rides, cakes, trips —
anyone pays, the app tracks who owes whom, and everyone gets a weekly SMS with their total
and a link showing exactly where each rupee came from.

## What's inside

**Everyone (app users)**
- Home: "you owe / you're owed" per person, one-tap *Settle* / *Got paid*
- Expenses: add any cost, pick who paid, split **equally or custom amounts**, attach to a budget
- Meals: pick breakfast / lunch from each day's menu (locks at cutoff time)
- Budgets: trip or fund with an optional limit, progress bar, who paid what
- Account: theme (System / Light / Dark), set PIN, personal bill link, full history
- Add people who aren't on the app (name + mobile) right from the expense form

**People without the app**
- Weekly SMS: who they owe, total, and a link to a read-only bill page (`/b/<token>`)
  with every line item. Admin can still enter their meals.

**Admin** (`/admin`)
- Packing list (who gets which packet, printable), menu per day, orders for anyone
- People: add, edit, give PIN, approve Google sign-ups (link to an existing person or approve as new)
- Weekly SMS: preview every message, send now to ticked people, log
- Settings: collector (pays food vendor + SMS), cutoffs, billing day/hour, SMS fee, template

**Login**: phone + 6-digit PIN, or Google. Unknown Google accounts land in *pending* until an admin
approves. The very first account (PIN via `/setup`, or Google) becomes admin.

## How balances work
Every expense share, meal order, SMS fee and payment becomes a ledger line
"A owes B". `pair_balances()` nets those per pair, so the app shows simple
"pay Kavi Rs. 450" lines — and every number can be traced back to its source.
Meals are owed to the **collector** (set in Settings). SMS fee is charged once a week.

## Setup

### 1. Supabase
A project **kotasa** (ap-south-1) is already created with the schema applied.
For a fresh project, run `supabase/migrations/20261010000000_init.sql` in the SQL editor.

Auth → URL Configuration:
- Site URL: your Vercel URL (e.g. `https://kotasa.vercel.app`)
- Redirect URLs: `https://kotasa.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`

### 2. Run locally
```bash
npm install
# .env.local is prefilled — paste SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API Keys → secret)
npm run dev
```
Open http://localhost:3000/setup to create the first admin.

### 3. Deploy to Vercel
```bash
npx vercel link        # create project "kotasa"
npx vercel env add ...  # or add every variable from .env.local in the Vercel dashboard
npx vercel --prod
```
Set `NEXT_PUBLIC_APP_URL` to the production URL. `vercel.json` runs the weekly-SMS cron daily
at 09:30 UTC (15:00 Sri Lanka); the route only sends on the billing day after the set hour.

### 4. Google login (optional)
1. Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
   Authorized redirect URI: `https://itutrhdrqrbvqkysnvdd.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Providers → Google: paste client ID + secret, enable.
3. Set `NEXT_PUBLIC_GOOGLE_LOGIN=on` and redeploy.

### 5. SMS (Notify.lk)
Add `NOTIFY_USER_ID`, `NOTIFY_API_KEY` (and your approved sender ID), then turn on
*Settings → Really send SMS*. Until then every send is logged as a dry run.
Check Notify.lk's current API format against `src/lib/sms.ts` before going live.

## Rebrand
Name and tagline: `src/lib/brand.ts`. Colors: tokens at the top of `src/app/globals.css`.
Icons: edit `scripts/make-icons.mjs`, then `node scripts/make-icons.mjs`.

## Structure
```
src/app/(app)/          member screens + /admin (all behind login)
src/app/b/[token]       public read-only bill
src/app/auth/callback   Google sign-in → link / pending / first admin
src/app/actions/        server actions (every write, with permission checks)
src/lib/ledger.ts       balances, history
src/lib/sms.ts          weekly messages + Notify.lk
supabase/migrations/    schema, ledger view, pair_balances(), RLS
```
Security: RLS is on for every table with no public policies; the browser keys can't read data.
All access goes through server code that checks the logged-in person first.
