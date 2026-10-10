-- Kotasa: shared office expenses (meals, rides, anything) + weekly SMS settle-up
-- Run in the Supabase SQL editor, or `supabase db push`.

create type meal_type as enum ('breakfast', 'lunch');
create type person_status as enum ('active', 'pending', 'inactive');

-- Everyone who can owe or be owed money. A person may or may not have an app login.
-- Guests (no login) still get SMS + a read-only bill link (view_token).
create table public.people (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text unique,                         -- 94XXXXXXXXX; needed for SMS
  email       text unique,                         -- used to match Google logins
  is_admin    boolean not null default false,
  status      person_status not null default 'active',
  view_token  text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 24),
  created_by  uuid references public.people (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- A person can have several logins (phone+PIN account, Google account).
create table public.person_logins (
  auth_user_id  uuid primary key references auth.users (id) on delete cascade,
  person_id     uuid not null references public.people (id) on delete cascade,
  method        text not null check (method in ('pin', 'google')),
  created_at    timestamptz not null default now()
);
create index person_logins_person_idx on public.person_logins (person_id);

-- Budgets: a named pot of spending with an optional limit (e.g. "Team outing", Rs. 20,000)
create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  limit_amount  numeric(12,2) check (limit_amount is null or limit_amount > 0),
  starts_on     date,
  ends_on       date,
  closed        boolean not null default false,
  created_by    uuid references public.people (id) on delete set null,
  created_at    timestamptz not null default now()
);

-- Any shared cost: an Uber, a cake, groceries...
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text not null default 'other',
  amount        numeric(12,2) not null check (amount > 0),
  paid_by       uuid not null references public.people (id) on delete restrict,
  expense_date  date not null,
  budget_id     uuid references public.budgets (id) on delete set null,
  split_type    text not null default 'equal' check (split_type in ('equal', 'custom')),
  note          text,
  created_by    uuid references public.people (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (expense_date);
create index expenses_budget_idx on public.expenses (budget_id);

-- Who shares an expense and how much each owes. Sum of shares = expense amount.
create table public.expense_shares (
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  person_id   uuid not null references public.people (id) on delete restrict,
  amount      numeric(12,2) not null check (amount >= 0),
  primary key (expense_id, person_id)
);
create index expense_shares_person_idx on public.expense_shares (person_id);

-- Meals module: per-day menu with daily prices
create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  menu_date   date not null,
  meal        meal_type not null,
  name        text not null,
  price       numeric(10,2) not null check (price >= 0),
  available   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index menu_items_date_idx on public.menu_items (menu_date, meal);

create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.people (id) on delete restrict,
  order_date    date not null,
  meal          meal_type not null,
  menu_item_id  uuid references public.menu_items (id) on delete set null,
  item_name     text not null,
  unit_price    numeric(10,2) not null check (unit_price >= 0),
  qty           int not null default 1 check (qty between 1 and 10),
  payee_id      uuid references public.people (id) on delete set null, -- who paid the vendor (collector at order time)
  created_by    uuid references public.people (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (person_id, order_date, meal)
);
create index orders_date_idx on public.orders (order_date);

-- Money handed over: from_person paid to_person
create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  from_person  uuid not null references public.people (id) on delete restrict,
  to_person    uuid not null references public.people (id) on delete restrict,
  amount       numeric(12,2) not null check (amount > 0),
  paid_on      date not null,
  note         text,
  recorded_by  uuid references public.people (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (from_person <> to_person)
);
create index settlements_date_idx on public.settlements (paid_on);

-- Every SMS attempt. fee > 0 only on the first successful SMS of a week; owed to the collector.
create table public.sms_logs (
  id                 uuid primary key default gen_random_uuid(),
  person_id          uuid not null references public.people (id) on delete cascade,
  collector_id       uuid references public.people (id) on delete set null,
  week_start         date not null,
  phone              text not null,
  message            text not null,
  fee                numeric(10,2) not null default 0,
  status             text not null check (status in ('sent', 'failed', 'dry_run')),
  provider_response  text,
  trigger            text not null check (trigger in ('manual', 'schedule')),
  created_at         timestamptz not null default now()
);
create index sms_logs_week_idx on public.sms_logs (week_start, person_id);

create table public.settings (
  id                int primary key default 1 check (id = 1),
  office_name       text not null default 'Office',
  collector_id      uuid references public.people (id) on delete set null, -- pays the food vendor + SMS
  breakfast_cutoff  time not null default '07:30',
  lunch_cutoff      time not null default '10:30',
  billing_weekday   int  not null default 5 check (billing_weekday between 1 and 7), -- 1=Mon
  sms_send_hour     int  not null default 15 check (sms_send_hour between 0 and 23),
  sms_enabled       boolean not null default false,
  sms_fee           numeric(10,2) not null default 2.00,
  sms_template      text not null default
    'Hi {name}, Kotasa weekly ({week}): {owe_lines}. Total Rs.{total}. Details: {link}',
  updated_at        timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------- Ledger ----------
-- One row = "debtor owes creditor amount" because of some source.
-- A settlement A->B is stored as B owing A, which cancels A's debt.
create or replace view public.ledger with (security_invoker = true) as
  select s.person_id as debtor, e.paid_by as creditor, s.amount,
         e.expense_date as entry_date, 'expense'::text as source, e.id as ref_id,
         e.title as label
  from public.expense_shares s join public.expenses e on e.id = s.expense_id
  where s.person_id <> e.paid_by and s.amount > 0
  union all
  select o.person_id, o.payee_id, o.unit_price * o.qty,
         o.order_date, 'meal', o.id,
         initcap(o.meal::text) || ': ' || o.item_name || case when o.qty > 1 then ' x' || o.qty else '' end
  from public.orders o
  where o.payee_id is not null and o.person_id <> o.payee_id
  union all
  select l.person_id, l.collector_id, l.fee,
         l.week_start + 6, 'sms', l.id, 'SMS fee'
  from public.sms_logs l
  where l.status = 'sent' and l.fee > 0 and l.collector_id is not null and l.person_id <> l.collector_id
  union all
  select t.to_person, t.from_person, t.amount,
         t.paid_on, 'settlement', t.id, coalesce(t.note, 'Payment')
  from public.settlements t;

revoke all on public.ledger from anon, authenticated;

-- Net pairwise balances up to (and including) p_until. Positive amount: debtor owes creditor.
create or replace function public.pair_balances(p_until date default '9999-12-31')
returns table (debtor uuid, creditor uuid, amount numeric)
language sql stable security definer set search_path = public as $$
  with d as (
    select least(debtor, creditor) a, greatest(debtor, creditor) b,
           sum(case when debtor < creditor then amount else -amount end) net
    from ledger
    where entry_date <= p_until
    group by 1, 2
  )
  select case when net > 0 then a else b end,
         case when net > 0 then b else a end,
         abs(net)
  from d where abs(net) >= 0.01;
$$;

revoke execute on function public.pair_balances(date) from public, anon, authenticated;
grant execute on function public.pair_balances(date) to service_role;

-- ---------- Row Level Security ----------
-- All reads and writes go through the Next.js server (service role) after permission checks.
-- RLS is on with no policies, so the public anon/auth keys can't read anything directly.
alter table public.people         enable row level security;
alter table public.person_logins  enable row level security;
alter table public.budgets        enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_shares enable row level security;
alter table public.menu_items     enable row level security;
alter table public.orders         enable row level security;
alter table public.settlements    enable row level security;
alter table public.sms_logs       enable row level security;
alter table public.settings       enable row level security;
