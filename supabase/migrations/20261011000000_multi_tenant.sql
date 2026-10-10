-- Multi-tenant Kotasa: groups (orgs), profiles vs members, roles, circles, invites.
-- Design: docs/multi-tenant-plan.md. Forward migration from 20261010000000_init.
--
-- Existing `people` move into one group "Office" and keep their ids as member ids, so every
-- existing reference (expenses, orders, settlements, sms_logs) stays valid.
-- Money columns keep their names (person_id, paid_by, from_person, ...) but now point at members.
-- Every person reference is a composite FK through members (org_id, id), so a row in one group can
-- never name a member of another group, even if app code has a bug.

create type org_kind as enum ('office', 'friends', 'trip', 'family', 'club', 'other');

-- ---------- Accounts ----------

-- A human who can log in. One profile can be a member of many groups.
create table public.profiles (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null,
  email              text unique,          -- verified (Google / email OTP), lowercase
  phone              text unique,          -- 94XXXXXXXXX, for phone + PIN login
  last_org_id        uuid,                 -- where "/" sends you (FK added below)
  is_platform_admin  boolean not null default false,
  created_at         timestamptz not null default now()
);

-- auth.users <-> profiles, many-to-one (a PIN login and a Google login can share a profile).
create table public.profile_logins (
  auth_user_id  uuid primary key references auth.users (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  method        text not null check (method in ('pin', 'google', 'email')),
  created_at    timestamptz not null default now()
);
create index profile_logins_profile_idx on public.profile_logins (profile_id);

-- ---------- Groups ----------

create table public.orgs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name        text not null,
  kind        org_kind not null default 'other',
  timezone    text not null default 'Asia/Colombo',
  currency    text not null default 'LKR',
  plan        text not null default 'free',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.profiles
  add foreign key (last_org_id) references public.orgs (id) on delete set null;

-- A role is a named permission set. Code checks permissions, never role names.
create table public.org_roles (
  org_id       uuid not null references public.orgs (id) on delete cascade,
  key          text not null check (key ~ '^[a-z0-9_]{2,30}$'),
  label        text not null,
  permissions  text[] not null default '{}',
  is_system    boolean not null default false,
  sort         int not null default 0,
  primary key (org_id, key)
);

-- Someone inside one group. profile_id null = SMS-only guest (no app login).
create table public.members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  profile_id  uuid references public.profiles (id) on delete set null,
  full_name   text not null,
  phone       text,                         -- 94XXXXXXXXX, for SMS in this group
  email       text,                         -- an invited person's verified signup links here
  role_key    text not null default 'member',
  status      person_status not null default 'active',
  view_token  text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 24),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, profile_id),
  unique (org_id, phone),
  unique (org_id, email),
  foreign key (org_id, role_key) references public.org_roles (org_id, key) on update cascade,
  foreign key (org_id, created_by) references public.members (org_id, id) on delete set null (created_by)
);
create index members_profile_idx on public.members (profile_id);

create table public.org_settings (
  org_id           uuid primary key references public.orgs (id) on delete cascade,
  meals_enabled    boolean not null default false,
  budgets_enabled  boolean not null default true,
  circles_enabled  boolean not null default true,
  sms_enabled      boolean not null default false,
  collector_id     uuid,                    -- pays the food vendor + SMS; meal/SMS debts are owed to them
  billing_weekday  int not null default 5 check (billing_weekday between 1 and 7), -- 1 = Mon
  sms_send_hour    int not null default 15 check (sms_send_hour between 0 and 23),
  sms_fee          numeric(10,2) not null default 2.00 check (sms_fee >= 0),
  sms_monthly_cap  int not null default 200 check (sms_monthly_cap >= 0),
  sms_template     text not null default
    'Hi {name}, {group} weekly ({week}): {owe_lines}. Total Rs.{total}. Details: {link}',
  updated_at       timestamptz not null default now(),
  foreign key (org_id, collector_id) references public.members (org_id, id) on delete set null (collector_id)
);

create table public.org_categories (
  org_id    uuid not null references public.orgs (id) on delete cascade,
  key       text not null check (key ~ '^[a-z0-9_]{2,30}$'),
  label     text not null,
  icon      text not null default 'receipt',
  sort      int not null default 0,
  archived  boolean not null default false,
  primary key (org_id, key)
);

create table public.org_meal_slots (
  org_id    uuid not null references public.orgs (id) on delete cascade,
  key       text not null check (key ~ '^[a-z0-9_]{2,30}$'),
  label     text not null,
  cutoff    time not null,
  sort      int not null default 0,
  archived  boolean not null default false,
  primary key (org_id, key)
);

-- Circles: named sub-groups of members inside a group (UI in phase 1b).
create table public.circles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  name        text not null,
  icon        text not null default 'users',
  visibility  text not null default 'group' check (visibility in ('group', 'circle')),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, created_by) references public.members (org_id, id) on delete set null (created_by)
);
create table public.circle_members (
  org_id     uuid not null,
  circle_id  uuid not null,
  member_id  uuid not null,
  primary key (circle_id, member_id),
  foreign key (org_id, circle_id) references public.circles (org_id, id) on delete cascade,
  foreign key (org_id, member_id) references public.members (org_id, id) on delete cascade
);
create index circle_members_member_idx on public.circle_members (member_id);

-- Invite links: /join/<code>. member_id set = "claim this guest" invite.
create table public.org_invites (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  code            text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 16),
  role_key        text not null default 'member',
  needs_approval  boolean not null default false,
  max_uses        int check (max_uses is null or max_uses > 0),
  uses            int not null default 0,
  expires_at      timestamptz,
  revoked         boolean not null default false,
  member_id       uuid,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  foreign key (org_id, role_key) references public.org_roles (org_id, key) on update cascade on delete cascade,
  foreign key (org_id, member_id) references public.members (org_id, id) on delete cascade,
  foreign key (org_id, created_by) references public.members (org_id, id) on delete set null (created_by)
);
create index org_invites_org_idx on public.org_invites (org_id);

-- ---------- Seeding a group ----------

-- Roles, settings, categories and meal slots for a new group. Templates differ by kind only in
-- defaults; any group can change everything afterwards.
create or replace function public.seed_org(p_org uuid, p_kind org_kind)
returns void language plpgsql security definer set search_path = public as $$
declare
  all_perms text[] := array[
    'expense.add', 'expense.edit_any', 'settle.record_any', 'meals.order_for_others',
    'meals.manage_menu', 'budgets.manage', 'circles.manage', 'members.invite',
    'members.manage', 'sms.send', 'settings.manage'];
begin
  insert into org_roles (org_id, key, label, permissions, is_system, sort) values
    (p_org, 'owner',  'Owner',  all_perms, true, 0),
    (p_org, 'admin',  'Admin',  all_perms, true, 1),
    (p_org, 'member', 'Member', array['expense.add', 'members.invite'], true, 2);

  insert into org_settings (org_id, meals_enabled) values (p_org, p_kind = 'office');

  insert into org_meal_slots (org_id, key, label, cutoff, sort) values
    (p_org, 'breakfast', 'Breakfast', '07:30', 0),
    (p_org, 'lunch',     'Lunch',     '10:30', 1);

  if p_kind = 'trip' then
    insert into org_categories (org_id, key, label, icon, sort) values
      (p_org, 'food',      'Food',      'fork-knife',   0),
      (p_org, 'fuel',      'Fuel',      'gas-pump',     1),
      (p_org, 'stay',      'Stay',      'bed',          2),
      (p_org, 'transport', 'Transport', 'car',          3),
      (p_org, 'tickets',   'Tickets',   'ticket',       4),
      (p_org, 'other',     'Other',     'receipt',      9);
  elsif p_kind = 'family' then
    insert into org_categories (org_id, key, label, icon, sort) values
      (p_org, 'groceries', 'Groceries', 'shopping-bag', 0),
      (p_org, 'bills',     'Bills',     'lightning',    1),
      (p_org, 'food',      'Food',      'fork-knife',   2),
      (p_org, 'health',    'Health',    'first-aid',    3),
      (p_org, 'fun',       'Fun',       'gift',         4),
      (p_org, 'other',     'Other',     'receipt',      9);
  else
    insert into org_categories (org_id, key, label, icon, sort) values
      (p_org, 'food',      'Food',      'fork-knife',   0),
      (p_org, 'ride',      'Ride',      'car',          1),
      (p_org, 'shopping',  'Shopping',  'shopping-bag', 2),
      (p_org, 'bills',     'Bills',     'lightning',    3),
      (p_org, 'fun',       'Fun',       'gift',         4),
      (p_org, 'other',     'Other',     'receipt',      9);
  end if;
end $$;

-- Create a group with its owner, atomically. Returns the new org id.
create or replace function public.create_org(
  p_name text, p_kind org_kind, p_slug text, p_profile uuid, p_owner_name text,
  p_owner_phone text default null, p_owner_email text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_member uuid;
begin
  insert into orgs (name, kind, slug, created_by) values (p_name, p_kind, p_slug, p_profile)
    returning id into v_org;
  perform seed_org(v_org, p_kind);
  insert into members (org_id, profile_id, full_name, phone, email, role_key)
    values (v_org, p_profile, p_owner_name, p_owner_phone, p_owner_email, 'owner')
    returning id into v_member;
  update org_settings set collector_id = v_member where org_id = v_org;
  update profiles set last_org_id = v_org where id = p_profile;
  return v_org;
end $$;

-- ---------- Move existing data into one group ----------

drop function if exists public.pair_balances(date);
drop view if exists public.ledger;

alter table public.budgets        add column org_id uuid, add column circle_id uuid;
alter table public.expenses       add column org_id uuid, add column circle_id uuid;
alter table public.expense_shares add column org_id uuid;
alter table public.menu_items     add column org_id uuid;
alter table public.orders         add column org_id uuid;
alter table public.settlements    add column org_id uuid;
alter table public.sms_logs       add column org_id uuid;

alter table public.menu_items alter column meal type text using meal::text;
alter table public.orders     alter column meal type text using meal::text;
drop type meal_type;

do $$
declare
  v_org uuid;
  v_name text;
  v_owner uuid;
begin
  if not exists (select 1 from public.people) then
    return;  -- fresh database: nothing to move
  end if;

  select coalesce(nullif(trim(office_name), ''), 'Office') into v_name from public.settings where id = 1;
  insert into public.orgs (name, kind, slug) values (coalesce(v_name, 'Office'), 'office', 'office')
    returning id into v_org;
  perform public.seed_org(v_org, 'office');

  -- People who can log in get a profile; the profile reuses the person's id.
  insert into public.profiles (id, full_name, email, phone, last_org_id, created_at)
    select p.id, p.full_name, p.email, p.phone, v_org, p.created_at
    from public.people p
    where exists (select 1 from public.person_logins l where l.person_id = p.id);
  insert into public.profile_logins (auth_user_id, profile_id, method, created_at)
    select auth_user_id, person_id, method, created_at from public.person_logins;

  -- The earliest admin becomes the owner.
  select id into v_owner from public.people where is_admin order by created_at limit 1;

  -- created_by is filled in a second pass so the self-reference never points at a missing row.
  insert into public.members (id, org_id, profile_id, full_name, phone, email, role_key, status, view_token, created_at)
    select p.id, v_org,
           case when exists (select 1 from public.person_logins l where l.person_id = p.id) then p.id end,
           p.full_name, p.phone, p.email,
           case when p.id = v_owner then 'owner' when p.is_admin then 'admin' else 'member' end,
           p.status, p.view_token, p.created_at
    from public.people p;
  update public.members m set created_by = p.created_by
    from public.people p where p.id = m.id and p.created_by is not null;

  update public.org_settings os set
      meals_enabled   = true,
      collector_id    = s.collector_id,
      billing_weekday = s.billing_weekday,
      sms_send_hour   = s.sms_send_hour,
      sms_enabled     = s.sms_enabled,
      sms_fee         = s.sms_fee,
      sms_template    = replace(s.sms_template, '{office}', '{group}')
    from public.settings s where s.id = 1 and os.org_id = v_org;
  update public.org_meal_slots ms set cutoff = case ms.key when 'breakfast' then s.breakfast_cutoff else s.lunch_cutoff end
    from public.settings s where s.id = 1 and ms.org_id = v_org;

  -- Expenses may use 'meal'/'delivery' categories from old code paths; make sure they exist.
  insert into public.org_categories (org_id, key, label, icon, sort, archived)
    select distinct v_org, e.category, initcap(e.category), 'receipt', 8, false
    from public.expenses e
    where not exists (select 1 from public.org_categories c where c.org_id = v_org and c.key = e.category);

  update public.budgets        set org_id = v_org;
  update public.expenses       set org_id = v_org;
  update public.expense_shares set org_id = v_org;
  update public.menu_items     set org_id = v_org;
  update public.orders         set org_id = v_org;
  update public.settlements    set org_id = v_org;
  update public.sms_logs       set org_id = v_org;
end $$;

-- Old identity tables go; CASCADE drops the old single-column FKs that pointed at people.
drop table public.person_logins;
drop table public.people cascade;
drop table public.settings;

-- ---------- Composite FKs on the money tables ----------

alter table public.budgets
  alter column org_id set not null,
  add foreign key (org_id) references public.orgs (id) on delete cascade,
  add unique (org_id, id),
  add foreign key (org_id, created_by) references public.members (org_id, id) on delete set null (created_by),
  add foreign key (org_id, circle_id) references public.circles (org_id, id) on delete set null (circle_id);

alter table public.expenses
  drop constraint if exists expenses_budget_id_fkey,
  alter column org_id set not null,
  add foreign key (org_id) references public.orgs (id) on delete cascade,
  add unique (org_id, id),
  add foreign key (org_id, paid_by) references public.members (org_id, id),
  add foreign key (org_id, created_by) references public.members (org_id, id) on delete set null (created_by),
  add foreign key (org_id, budget_id) references public.budgets (org_id, id) on delete set null (budget_id),
  add foreign key (org_id, circle_id) references public.circles (org_id, id) on delete set null (circle_id),
  add foreign key (org_id, category) references public.org_categories (org_id, key) on update cascade;

alter table public.expense_shares
  drop constraint if exists expense_shares_expense_id_fkey,
  alter column org_id set not null,
  add foreign key (org_id, expense_id) references public.expenses (org_id, id) on delete cascade,
  add foreign key (org_id, person_id) references public.members (org_id, id);

alter table public.menu_items
  alter column org_id set not null,
  add foreign key (org_id) references public.orgs (id) on delete cascade,
  add unique (org_id, id),
  add foreign key (org_id, meal) references public.org_meal_slots (org_id, key) on update cascade;

alter table public.orders
  drop constraint if exists orders_menu_item_id_fkey,
  alter column org_id set not null,
  add foreign key (org_id) references public.orgs (id) on delete cascade,
  add foreign key (org_id, person_id) references public.members (org_id, id),
  add foreign key (org_id, payee_id) references public.members (org_id, id) on delete set null (payee_id),
  add foreign key (org_id, created_by) references public.members (org_id, id) on delete set null (created_by),
  add foreign key (org_id, menu_item_id) references public.menu_items (org_id, id) on delete set null (menu_item_id),
  add foreign key (org_id, meal) references public.org_meal_slots (org_id, key) on update cascade;

alter table public.settlements
  alter column org_id set not null,
  add foreign key (org_id) references public.orgs (id) on delete cascade,
  add foreign key (org_id, from_person) references public.members (org_id, id),
  add foreign key (org_id, to_person) references public.members (org_id, id),
  add foreign key (org_id, recorded_by) references public.members (org_id, id) on delete set null (recorded_by);

alter table public.sms_logs
  alter column org_id set not null,
  add foreign key (org_id) references public.orgs (id) on delete cascade,
  add foreign key (org_id, person_id) references public.members (org_id, id) on delete cascade,
  add foreign key (org_id, collector_id) references public.members (org_id, id) on delete set null (collector_id);

drop index if exists public.expenses_date_idx;
drop index if exists public.menu_items_date_idx;
drop index if exists public.orders_date_idx;
drop index if exists public.settlements_date_idx;
drop index if exists public.sms_logs_week_idx;
create index expenses_org_date_idx    on public.expenses (org_id, expense_date);
create index menu_items_org_date_idx  on public.menu_items (org_id, menu_date, meal);
create index orders_org_date_idx      on public.orders (org_id, order_date);
create index settlements_org_date_idx on public.settlements (org_id, paid_on);
create index sms_logs_org_week_idx    on public.sms_logs (org_id, week_start, person_id);
create index budgets_org_idx          on public.budgets (org_id);

-- ---------- Ledger, per group ----------
-- One row = "debtor owes creditor amount" inside one group.
-- A settlement A->B is stored as B owing A, which cancels A's debt.
-- circle_id is set for expenses in a circle, so circle balances can be computed from them alone.
create view public.ledger with (security_invoker = true) as
  select e.org_id, s.person_id as debtor, e.paid_by as creditor, s.amount,
         e.expense_date as entry_date, 'expense'::text as source, e.id as ref_id,
         e.title as label, e.circle_id
  from public.expense_shares s join public.expenses e on e.id = s.expense_id
  where s.person_id <> e.paid_by and s.amount > 0
  union all
  select o.org_id, o.person_id, o.payee_id, o.unit_price * o.qty,
         o.order_date, 'meal', o.id,
         coalesce(ms.label, initcap(o.meal)) || ': ' || o.item_name
           || case when o.qty > 1 then ' x' || o.qty else '' end,
         null::uuid
  from public.orders o
  left join public.org_meal_slots ms on ms.org_id = o.org_id and ms.key = o.meal
  where o.payee_id is not null and o.person_id <> o.payee_id
  union all
  select l.org_id, l.person_id, l.collector_id, l.fee,
         l.week_start + 6, 'sms', l.id, 'SMS fee', null::uuid
  from public.sms_logs l
  where l.status = 'sent' and l.fee > 0 and l.collector_id is not null and l.person_id <> l.collector_id
  union all
  select t.org_id, t.to_person, t.from_person, t.amount,
         t.paid_on, 'settlement', t.id, coalesce(t.note, 'Payment'), null::uuid
  from public.settlements t;

revoke all on public.ledger from anon, authenticated;

-- Net pairwise balances inside one group, up to and including p_until.
-- p_circle limits it to that circle's expenses. Positive amount: debtor owes creditor.
create or replace function public.pair_balances(
  p_org uuid, p_until date default '9999-12-31', p_circle uuid default null)
returns table (debtor uuid, creditor uuid, amount numeric)
language sql stable security definer set search_path = public as $$
  with d as (
    select least(debtor, creditor) a, greatest(debtor, creditor) b,
           sum(case when debtor < creditor then amount else -amount end) net
    from ledger
    where org_id = p_org
      and entry_date <= p_until
      and (p_circle is null or circle_id = p_circle)
    group by 1, 2
  )
  select case when net > 0 then a else b end,
         case when net > 0 then b else a end,
         abs(net)
  from d where abs(net) >= 0.01;
$$;

revoke execute on function public.pair_balances(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.pair_balances(uuid, date, uuid) to service_role;
revoke execute on function public.seed_org(uuid, org_kind) from public, anon, authenticated;
grant execute on function public.seed_org(uuid, org_kind) to service_role;
revoke execute on function public.create_org(text, org_kind, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_org(text, org_kind, text, uuid, text, text, text) to service_role;

-- ---------- Row Level Security ----------
-- Same model as before: all access goes through the Next.js server (service role) after
-- permission checks. RLS on with no policies, so the browser keys can't read anything.
alter table public.profiles        enable row level security;
alter table public.profile_logins  enable row level security;
alter table public.orgs            enable row level security;
alter table public.org_roles       enable row level security;
alter table public.members         enable row level security;
alter table public.org_settings    enable row level security;
alter table public.org_categories  enable row level security;
alter table public.org_meal_slots  enable row level security;
alter table public.circles         enable row level security;
alter table public.circle_members  enable row level security;
alter table public.org_invites     enable row level security;
