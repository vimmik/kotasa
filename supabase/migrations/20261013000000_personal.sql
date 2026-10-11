-- Personal budgets ("Me"): a private money space per profile. Design: docs/personal-budget-plan.md.
-- Everything here belongs to one profile. Your share of group spending is read live from the group
-- tables by personal_spend(), never copied, so edits in a group show up in Me straight away.

alter table public.profiles
  add column plan           text not null default 'free',
  add column currency       text not null default 'LKR' check (currency ~ '^[A-Z]{3}$'),
  add column monthly_income numeric(12,2) check (monthly_income > 0),
  add column payday         smallint check (payday between 1 and 28);

create table public.personal_categories (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  key        text not null check (key ~ '^[a-z0-9][a-z0-9_-]{0,29}$'),
  label      text not null,
  icon       text not null default 'receipt',
  sort       int  not null default 0,
  archived   boolean not null default false,
  primary key (profile_id, key)
);

-- Where one group's category lands in your own categories. Only overrides are stored; without one,
-- personal_default_key() decides.
create table public.personal_category_map (
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  org_id       uuid not null references public.orgs (id) on delete cascade,
  org_category text not null,
  personal_key text not null,
  primary key (profile_id, org_id, org_category),
  foreign key (profile_id, personal_key) references public.personal_categories (profile_id, key)
    on update cascade on delete cascade
);

-- Groups whose spending you don't want in Me. No row = fed in.
create table public.personal_group_feed (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id     uuid not null references public.orgs (id) on delete cascade,
  enabled    boolean not null,
  primary key (profile_id, org_id)
);

create table public.personal_expenses (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  category   text not null,
  title      text not null,
  merchant   text,
  spent_on   date not null,
  note       text,
  source     text not null default 'manual' check (source in ('manual', 'quick', 'sms', 'bill')),
  created_at timestamptz not null default now(),
  foreign key (profile_id, category) references public.personal_categories (profile_id, key) on update cascade
);
create index personal_expenses_profile_date_idx on public.personal_expenses (profile_id, spent_on);

create table public.personal_budgets (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  amount     numeric(12,2) not null check (amount > 0),
  is_main    boolean not null default false,
  period     text not null check (period in ('day', 'week', 'month', 'year', 'payday', 'custom')),
  starts_on  date not null,              -- custom: first day; others: where rollover counting starts
  ends_on    date,                       -- custom only
  categories text[],                     -- null = all spending
  rollover   text not null default 'off' check (rollover in ('off', 'carry', 'goal')),
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  check ((period = 'custom') = (ends_on is not null)),
  check (ends_on is null or ends_on >= starts_on)
);
create index personal_budgets_profile_idx on public.personal_budgets (profile_id);
create unique index personal_budgets_one_main on public.personal_budgets (profile_id) where is_main and not archived;

-- ---------- Seeding ----------

create or replace function public.seed_personal(p_profile uuid)
returns void language sql security definer set search_path = public as $$
  insert into personal_categories (profile_id, key, label, icon, sort) values
    (p_profile, 'food',      'Food',      'fork-knife',   0),
    (p_profile, 'groceries', 'Groceries', 'shopping-bag', 1),
    (p_profile, 'transport', 'Transport', 'car',          2),
    (p_profile, 'bills',     'Bills',     'lightning',    3),
    (p_profile, 'shopping',  'Shopping',  'gift',         4),
    (p_profile, 'health',    'Health',    'first-aid',    5),
    (p_profile, 'fun',       'Fun',       'ticket',       6),
    (p_profile, 'home',      'Home',      'house',        7),
    (p_profile, 'travel',    'Travel',    'airplane',     8),
    (p_profile, 'other',     'Other',     'receipt',      99)
  on conflict do nothing;
$$;

-- Group category key -> default personal category key. Group keys are free-form, so unknown ones
-- fall through unchanged and then to 'other' if you have no category with that key.
create or replace function public.personal_default_key(k text)
returns text language sql immutable as $$
  select case k
    when 'ride'    then 'transport'
    when 'fuel'    then 'transport'
    when 'stay'    then 'travel'
    when 'tickets' then 'fun'
    when '__meal'  then 'food'
    when '__sms'   then 'bills'
    else k end;
$$;

-- ---------- What you spent ----------
-- One row per thing you consumed between p_from and p_to: your own entries, plus your shares of
-- group expenses, your meal orders and your SMS fees from every group you're in (unless you
-- switched that group off). What you paid on behalf of others is not here: that is a debt, not
-- spending. Settlements are not here either.
-- `counted` is false for group rows in a currency other than yours; they are listed but never totalled.
create or replace function public.personal_spend(p_profile uuid, p_from date, p_to date)
returns table (
  source text, ref_id uuid, org_id uuid, org_name text, org_slug text, spent_on date,
  amount numeric, category text, title text, currency text, counted boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (
    select currency from profiles where id = p_profile
  ), mine as (
    select m.id as member_id, m.org_id, o.name, o.slug, o.currency
    from members m join orgs o on o.id = m.org_id
    where m.profile_id = p_profile
      and not exists (select 1 from personal_group_feed f
                      where f.profile_id = p_profile and f.org_id = m.org_id and not f.enabled)
  ), raw as (
    select 'manual'::text as source, e.id as ref_id, null::uuid as org_id, null::text as org_name,
           null::text as org_slug, e.spent_on, e.amount, e.category as cat, null::text as org_cat,
           e.title, (select currency from me) as currency, e.created_at
    from personal_expenses e
    where e.profile_id = p_profile and e.spent_on between p_from and p_to
    union all
    select 'expense', e.id, mi.org_id, mi.name, mi.slug, e.expense_date, s.amount, null, e.category,
           e.title, mi.currency, e.created_at
    from mine mi
    join expense_shares s on s.org_id = mi.org_id and s.person_id = mi.member_id
    join expenses e on e.org_id = s.org_id and e.id = s.expense_id
    where s.amount > 0 and e.expense_date between p_from and p_to
    union all
    select 'meal', o.id, mi.org_id, mi.name, mi.slug, o.order_date, o.unit_price * o.qty, null, '__meal',
           coalesce(ms.label, initcap(o.meal)) || ': ' || o.item_name
             || case when o.qty > 1 then ' x' || o.qty else '' end,
           mi.currency, o.created_at
    from mine mi
    join orders o on o.org_id = mi.org_id and o.person_id = mi.member_id
    left join org_meal_slots ms on ms.org_id = o.org_id and ms.key = o.meal
    where o.order_date between p_from and p_to
    union all
    select 'sms', l.id, mi.org_id, mi.name, mi.slug, l.week_start + 6, l.fee, null, '__sms',
           'SMS fee', mi.currency, l.created_at
    from mine mi
    join sms_logs l on l.org_id = mi.org_id and l.person_id = mi.member_id
    where l.status = 'sent' and l.fee > 0 and l.collector_id is not null
      and l.week_start + 6 between p_from and p_to
  )
  select r.source, r.ref_id, r.org_id, r.org_name, r.org_slug, r.spent_on, r.amount,
         coalesce(r.cat, map.personal_key, dflt.key, 'other'),
         r.title, r.currency, r.currency = (select currency from me), r.created_at
  from raw r
  left join personal_category_map map
    on map.profile_id = p_profile and map.org_id = r.org_id and map.org_category = r.org_cat
  left join personal_categories dflt
    on dflt.profile_id = p_profile and dflt.key = personal_default_key(r.org_cat)
  order by r.spent_on desc, r.created_at desc;
$$;

revoke execute on function public.seed_personal(uuid) from public, anon, authenticated;
grant execute on function public.seed_personal(uuid) to service_role;
revoke execute on function public.personal_spend(uuid, date, date) from public, anon, authenticated;
grant execute on function public.personal_spend(uuid, date, date) to service_role;

alter table public.personal_categories   enable row level security;
alter table public.personal_category_map enable row level security;
alter table public.personal_group_feed   enable row level security;
alter table public.personal_expenses     enable row level security;
alter table public.personal_budgets      enable row level security;
revoke all on public.personal_categories, public.personal_category_map, public.personal_group_feed,
              public.personal_expenses, public.personal_budgets from anon, authenticated;
grant all on public.personal_categories, public.personal_category_map, public.personal_group_feed,
             public.personal_expenses, public.personal_budgets to service_role;
