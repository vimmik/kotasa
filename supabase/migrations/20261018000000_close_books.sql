-- Closing the books. "Fewest payments" works out who pays whom from the whole group's ledger
-- every time, so one payment (or one late expense) could change what other people were told
-- they owe or are owed. Closing freezes every balance up to a date:
--   * org_closings: one row per close. The latest one is in force.
--   * org_closing_balances: who owed whom at that date, as it was shown. Never recalculated.
--   * Balances = those frozen amounts + only what happened after the date. A payment between
--     two people first pays off their frozen balance, so it changes nobody else's.
--   * Nothing dated on or before the date can be added, changed or deleted (guard_closed_books).
-- The latest close can be undone ("reopen"): delete its row and the one before is in force again.

create table public.org_closings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id) on delete cascade,
  closed_through date not null,
  closed_by      uuid,
  note           text,
  closed_at      timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, closed_through),
  foreign key (org_id, closed_by) references public.members (org_id, id) on delete set null (closed_by)
);

create table public.org_closing_balances (
  closing_id uuid not null,
  org_id     uuid not null,
  debtor     uuid not null,
  creditor   uuid not null,
  amount     numeric(12,2) not null check (amount > 0),
  primary key (closing_id, debtor, creditor),
  foreign key (org_id, closing_id) references public.org_closings (org_id, id) on delete cascade,
  foreign key (org_id, debtor) references public.members (org_id, id),
  foreign key (org_id, creditor) references public.members (org_id, id),
  check (debtor <> creditor)
);
create index org_closing_balances_org_idx on public.org_closing_balances (org_id);

alter table public.org_closings         enable row level security;
alter table public.org_closing_balances enable row level security;

-- Close the books every week on the billing day, through the day before (cron).
alter table public.org_settings add column auto_close boolean not null default false;

-- ---------- No changes on closed dates ----------

-- Row trigger. tg_argv[0] is the row's date column ('expense_id' = the date of its expense);
-- tg_argv[1], when given, lists the columns that move money, so an update that only touches
-- others (a title, a note) still goes through.
create or replace function public.guard_closed_books()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_through date;
  v_dates date[];
begin
  if current_setting('kotasa.allow_closed', true) = 'on' then
    return coalesce(new, old);
  end if;
  select max(c.closed_through) into v_through
  from org_closings c where c.org_id = coalesce(n->>'org_id', o->>'org_id')::uuid;
  if v_through is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and tg_nargs > 1 and not exists (
    select 1 from unnest(string_to_array(tg_argv[1], ',')) k where (n->k) is distinct from (o->k)
  ) then
    return new;
  end if;
  if tg_argv[0] = 'expense_id' then
    -- When the expense itself is being deleted it is already gone here, and its own trigger decided.
    select array_agg(e.expense_date) into v_dates
    from expenses e where e.id in ((n->>'expense_id')::uuid, (o->>'expense_id')::uuid);
  else
    v_dates := array[(n->>tg_argv[0])::date, (o->>tg_argv[0])::date];
  end if;
  if exists (select 1 from unnest(v_dates) d where d <= v_through) then
    raise exception 'The books are closed up to %. Anything on or before that date can''t be changed.',
      to_char(v_through, 'FMDD Mon YYYY')
      using hint = 'kotasa_books_closed';
  end if;
  return coalesce(new, old);
end $$;

create trigger expenses_closed before insert or update or delete on public.expenses
  for each row execute function public.guard_closed_books('expense_date', 'expense_date,paid_by,amount,circle_id');
create trigger expense_shares_closed before insert or update or delete on public.expense_shares
  for each row execute function public.guard_closed_books('expense_id');
create trigger expense_copayers_closed before insert or update or delete on public.expense_copayers
  for each row execute function public.guard_closed_books('expense_id');
create trigger orders_closed before insert or update or delete on public.orders
  for each row execute function public.guard_closed_books('order_date', 'order_date,person_id,payee_id,unit_price,qty');
create trigger meal_joins_closed before insert or update or delete on public.meal_joins
  for each row execute function public.guard_closed_books('join_date');
create trigger meal_payers_closed before insert or update or delete on public.meal_payers
  for each row execute function public.guard_closed_books('pay_date', 'pay_date,member_id');
create trigger meal_copayers_closed before insert or update or delete on public.meal_copayers
  for each row execute function public.guard_closed_books('pay_date');
create trigger settlements_closed before insert or update or delete on public.settlements
  for each row execute function public.guard_closed_books('paid_on', 'paid_on,from_person,to_person,amount');

-- ---------- Balances ----------

-- The chain shortening from 20261016, on any set of flows ("debtor:creditor" -> amount): X owes
-- Y, Y owes Z -> X pays Z, only when X and Z share a ledger line or Z is the collector.
create or replace function public.simplify_flows(p_org uuid, p_flow jsonb, p_until date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_flow  jsonb := p_flow;
  v_known jsonb;
  v_coll  text;
  v_xz numeric;
  r record;
  i int := 0;
begin
  select coalesce(jsonb_object_agg(k.key, true), '{}') into v_known
  from (select l.debtor::text || ':' || l.creditor::text as key from ledger l
        where l.org_id = p_org and l.entry_date <= p_until
        union
        select l.creditor::text || ':' || l.debtor::text from ledger l
        where l.org_id = p_org and l.entry_date <= p_until) k;

  select s.collector_id::text into v_coll from org_settings s where s.org_id = p_org;

  loop
    i := i + 1;
    exit when i > 10000; -- each step cuts the total moved by >= 0.01, so this is only a guard

    with f as (
      select split_part(e.key, ':', 1) as d, split_part(e.key, ':', 2) as c, e.value::numeric as a
      from jsonb_each_text(v_flow) e where e.value::numeric >= 0.01
    )
    select f1.d as x, f1.c as y, f2.c as z, least(f1.a, f2.a) as m into r
    from f f1 join f f2 on f2.d = f1.c and f2.c <> f1.d
    where v_known ? (f1.d || ':' || f2.c) or f2.c = v_coll
    order by (v_known ? (f1.d || ':' || f2.c)) desc, least(f1.a, f2.a) desc, f1.d, f1.c, f2.c
    limit 1;
    exit when not found;

    v_xz := coalesce((v_flow->>(r.x || ':' || r.z))::numeric, 0) + r.m
            - coalesce((v_flow->>(r.z || ':' || r.x))::numeric, 0);
    v_flow := v_flow || jsonb_build_object(
      r.x || ':' || r.y, (v_flow->>(r.x || ':' || r.y))::numeric - r.m,
      r.y || ':' || r.z, (v_flow->>(r.y || ':' || r.z))::numeric - r.m,
      r.x || ':' || r.z, greatest(v_xz, 0),
      r.z || ':' || r.x, greatest(-v_xz, 0));
  end loop;
  return v_flow;
end $$;

-- What everyone should pay whom, up to p_until. With no close in force this is what 20261016
-- returned. With one: its frozen balances, less payments made since between the same two
-- people, plus everything else since (simplified when "Fewest payments" is on), netted per pair.
create or replace function public.group_balances(
  p_org uuid, p_until date default '9999-12-31', p_circle uuid default null)
returns table (debtor uuid, creditor uuid, amount numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_simplify boolean;
  v_close    uuid;
  v_from     date;
  v_frozen   jsonb;
  v_flow     jsonb;
begin
  if p_circle is not null then
    return query select p.debtor, p.creditor, p.amount from pair_balances(p_org, p_until, p_circle) p;
    return;
  end if;
  v_simplify := coalesce((select s.simplify_debts from org_settings s where s.org_id = p_org), false);
  select c.id, c.closed_through into v_close, v_from
  from org_closings c where c.org_id = p_org and c.closed_through <= p_until
  order by c.closed_through desc limit 1;

  if v_close is null then
    select coalesce(jsonb_object_agg(p.debtor::text || ':' || p.creditor::text, p.amount), '{}') into v_flow
    from pair_balances(p_org, p_until, null) p;
    v_frozen := '{}';
  else
    -- Per pair (a < b), signed: + means a owes b.
    with
    frozen as (
      select least(b.debtor, b.creditor) as a, greatest(b.debtor, b.creditor) as b,
             sum(case when b.debtor < b.creditor then b.amount else -b.amount end) as v
      from org_closing_balances b where b.closing_id = v_close group by 1, 2
    ),
    since as (
      select least(l.debtor, l.creditor) as a, greatest(l.debtor, l.creditor) as b,
             sum(case when l.source = 'settlement' then case when l.debtor < l.creditor then l.amount else -l.amount end else 0 end) as paid,
             sum(case when l.source <> 'settlement' then case when l.debtor < l.creditor then l.amount else -l.amount end else 0 end) as rest
      from ledger l
      where l.org_id = p_org and l.entry_date > v_from and l.entry_date <= p_until
      group by 1, 2
    ),
    j as (
      select coalesce(f.a, s.a) as a, coalesce(f.b, s.b) as b,
             coalesce(f.v, 0) as f, coalesce(s.paid, 0) as p, coalesce(s.rest, 0) as r
      from frozen f full join since s on s.a = f.a and s.b = f.b
    ),
    -- A payment the other way pays off the frozen balance first; only what's left over is new.
    applied as (
      select a, b, r,
             case when f * p < 0 then (case when abs(p) <= abs(f) then f + p else 0 end) else f end as f,
             case when f * p < 0 then (case when abs(p) <= abs(f) then 0 else f + p end) else p end as p
      from j
    )
    select
      coalesce(jsonb_object_agg(case when x.f > 0 then x.a || ':' || x.b else x.b || ':' || x.a end, abs(x.f))
                 filter (where abs(x.f) >= 0.01), '{}'),
      coalesce(jsonb_object_agg(case when x.p + x.r > 0 then x.a || ':' || x.b else x.b || ':' || x.a end, abs(x.p + x.r))
                 filter (where abs(x.p + x.r) >= 0.01), '{}')
      into v_frozen, v_flow
    from applied x;
  end if;

  if v_simplify then
    v_flow := simplify_flows(p_org, v_flow, p_until);
  end if;

  return query
    with rows as (
      select split_part(e.key, ':', 1)::uuid as d, split_part(e.key, ':', 2)::uuid as c, e.value::numeric as v
      from jsonb_each_text(v_frozen) e
      union all
      select split_part(e.key, ':', 1)::uuid, split_part(e.key, ':', 2)::uuid, e.value::numeric
      from jsonb_each_text(v_flow) e
    ),
    net as (
      select least(d, c) as a, greatest(d, c) as b, sum(case when d < c then v else -v end) as v
      from rows group by 1, 2
    )
    select case when v > 0 then a else b end, case when v > 0 then b else a end, round(abs(v), 2)
    from net where abs(v) >= 0.01;
end $$;

revoke execute on function public.group_balances(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.group_balances(uuid, date, uuid) to service_role;
revoke execute on function public.simplify_flows(uuid, jsonb, date) from public, anon, authenticated;
grant execute on function public.simplify_flows(uuid, jsonb, date) to service_role;
revoke execute on function public.guard_closed_books() from public, anon, authenticated;

-- Close the books through p_through: store everyone's balance as it stands, then lock the dates.
create or replace function public.close_books(p_org uuid, p_through date, p_by uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_last date;
  v_rows jsonb;
  v_id   uuid;
begin
  perform 1 from orgs where id = p_org for update; -- one close at a time per group
  select max(closed_through) into v_last from org_closings where org_id = p_org;
  if v_last is not null and p_through <= v_last then
    raise exception 'close_books: already closed up to %', v_last;
  end if;
  -- Read before the new close exists, or group_balances would already use it.
  select coalesce(jsonb_agg(jsonb_build_object('d', g.debtor, 'c', g.creditor, 'a', g.amount)), '[]') into v_rows
  from group_balances(p_org, p_through, null) g;

  insert into org_closings (org_id, closed_through, closed_by, note)
  values (p_org, p_through, p_by, p_note) returning id into v_id;
  insert into org_closing_balances (closing_id, org_id, debtor, creditor, amount)
  select v_id, p_org, (r->>'d')::uuid, (r->>'c')::uuid, (r->>'a')::numeric
  from jsonb_array_elements(v_rows) r where (r->>'a')::numeric >= 0.01;
  return v_id;
end $$;

revoke execute on function public.close_books(uuid, date, uuid, text) from public, anon, authenticated;
grant execute on function public.close_books(uuid, date, uuid, text) to service_role;

-- ---------- Permission ----------

update public.org_roles set permissions = array_append(permissions, 'books.close')
where key in ('owner', 'admin') and not ('books.close' = any (permissions));

-- New groups (seed_org from 20261011, with books.close for owner and admin).
create or replace function public.seed_org(p_org uuid, p_kind org_kind)
returns void language plpgsql security definer set search_path = public as $$
declare
  all_perms text[] := array[
    'expense.add', 'expense.edit_any', 'settle.record_any', 'meals.order_for_others',
    'meals.manage_menu', 'budgets.manage', 'circles.manage', 'members.invite',
    'members.manage', 'sms.send', 'settings.manage', 'books.close'];
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


-- Merging two member rows (20261015) also moves their closed balances, and may touch closed dates.
create or replace function public.merge_members(p_org uuid, p_from uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_from public.members;
  v_to   public.members;
begin
  if p_from = p_to then return; end if;
  -- Merging rewrites history, closed dates included (see guard_closed_books).
  perform set_config('kotasa.allow_closed', 'on', true);
  select * into v_from from public.members where org_id = p_org and id = p_from for update;
  select * into v_to   from public.members where org_id = p_org and id = p_to for update;
  if v_from.id is null or v_to.id is null then
    raise exception 'merge_members: both members must be in this group';
  end if;
  if exists (
    select 1 from public.orders a join public.orders b
      on b.org_id = a.org_id and b.order_date = a.order_date and b.meal = a.meal
    where a.org_id = p_org and a.person_id = p_from and b.person_id = p_to
  ) then
    raise exception 'merge_members: both have a meal order for the same day';
  end if;

  -- Shares in the same expense add up into one.
  update public.expense_shares t set amount = t.amount + f.amount
  from public.expense_shares f
  where t.org_id = p_org and f.org_id = p_org and t.expense_id = f.expense_id
    and t.person_id = p_to and f.person_id = p_from;
  delete from public.expense_shares s
  where s.org_id = p_org and s.person_id = p_from
    and exists (select 1 from public.expense_shares t where t.expense_id = s.expense_id and t.person_id = p_to);
  update public.expense_shares set person_id = p_to where org_id = p_org and person_id = p_from;

  update public.expenses set paid_by = p_to where org_id = p_org and paid_by = p_from;
  update public.expenses set created_by = p_to where org_id = p_org and created_by = p_from;
  update public.budgets set created_by = p_to where org_id = p_org and created_by = p_from;

  update public.orders set person_id = p_to where org_id = p_org and person_id = p_from;
  update public.orders set payee_id = p_to where org_id = p_org and payee_id = p_from;
  update public.orders set created_by = p_to where org_id = p_org and created_by = p_from;

  -- A payment between the two halves of one person means nothing once they are one.
  delete from public.settlements
  where org_id = p_org and ((from_person = p_from and to_person = p_to) or (from_person = p_to and to_person = p_from));
  update public.settlements set from_person = p_to where org_id = p_org and from_person = p_from;
  update public.settlements set to_person = p_to where org_id = p_org and to_person = p_from;
  update public.settlements set recorded_by = p_to where org_id = p_org and recorded_by = p_from;

  update public.sms_logs set person_id = p_to where org_id = p_org and person_id = p_from;
  update public.sms_logs set collector_id = p_to where org_id = p_org and collector_id = p_from;
  update public.org_settings set collector_id = p_to where org_id = p_org and collector_id = p_from;

  update public.meal_payers set member_id = p_to where org_id = p_org and member_id = p_from;
  update public.meal_payers set set_by = p_to where org_id = p_org and set_by = p_from;
  delete from public.meal_joins j
  where j.org_id = p_org and j.member_id = p_from
    and exists (select 1 from public.meal_joins t
                where t.org_id = p_org and t.join_date = j.join_date and t.meal = j.meal and t.member_id = p_to);
  update public.meal_joins set member_id = p_to where org_id = p_org and member_id = p_from;
  update public.meal_joins set created_by = p_to where org_id = p_org and created_by = p_from;

  delete from public.circle_members c
  where c.org_id = p_org and c.member_id = p_from
    and exists (select 1 from public.circle_members t where t.circle_id = c.circle_id and t.member_id = p_to);
  update public.circle_members set member_id = p_to where org_id = p_org and member_id = p_from;
  update public.circles set created_by = p_to where org_id = p_org and created_by = p_from;

  -- Co-payers (20261015): one person can't owe themselves; the same person twice adds up.
  update public.expense_copayers t set amount = t.amount + f.amount
  from public.expense_copayers f
  where t.org_id = p_org and f.org_id = p_org and t.expense_id = f.expense_id
    and t.member_id = p_to and f.member_id = p_from;
  delete from public.expense_copayers c
  where c.org_id = p_org and c.member_id = p_from
    and exists (select 1 from public.expense_copayers t where t.expense_id = c.expense_id and t.member_id = p_to);
  update public.expense_copayers set member_id = p_to where org_id = p_org and member_id = p_from;
  delete from public.expense_copayers c using public.expenses e
  where c.org_id = p_org and e.id = c.expense_id and c.member_id = e.paid_by;
  delete from public.meal_copayers
  where org_id = p_org and ((payer_id = p_from and member_id = p_to) or (payer_id = p_to and member_id = p_from));
  update public.meal_copayers set payer_id = p_to where org_id = p_org and payer_id = p_from;
  update public.meal_copayers t set amount = t.amount + f.amount
  from public.meal_copayers f
  where t.org_id = p_org and f.org_id = p_org and t.pay_date = f.pay_date and t.meal = f.meal
    and t.member_id = p_to and f.member_id = p_from;
  delete from public.meal_copayers c
  where c.org_id = p_org and c.member_id = p_from
    and exists (select 1 from public.meal_copayers t
                where t.org_id = p_org and t.pay_date = c.pay_date and t.meal = c.meal and t.member_id = p_to);
  update public.meal_copayers set member_id = p_to where org_id = p_org and member_id = p_from;

  delete from public.org_invites where org_id = p_org and member_id = p_from; -- its claim links
  update public.org_invites set created_by = p_to where org_id = p_org and created_by = p_from;
  update public.members set created_by = p_to where org_id = p_org and created_by = p_from;

  -- Closed balances (20261018): same rules as shares, the same person twice adds up.
  update public.org_closings set closed_by = p_to where org_id = p_org and closed_by = p_from;
  insert into public.org_closing_balances (closing_id, org_id, debtor, creditor, amount)
  select x.closing_id, p_org, x.d, x.c, sum(x.amount)
  from (select b.closing_id,
               case when b.debtor = p_from then p_to else b.debtor end as d,
               case when b.creditor = p_from then p_to else b.creditor end as c,
               b.amount
        from public.org_closing_balances b
        where b.org_id = p_org and (b.debtor = p_from or b.creditor = p_from)) x
  where x.d <> x.c
  group by x.closing_id, x.d, x.c
  on conflict (closing_id, debtor, creditor)
    do update set amount = public.org_closing_balances.amount + excluded.amount;
  delete from public.org_closing_balances
  where org_id = p_org and (debtor = p_from or creditor = p_from);

  delete from public.members where org_id = p_org and id = p_from;

  -- The one that stays keeps its own details and fills the gaps from the duplicate.
  update public.members set
    phone      = coalesce(phone, v_from.phone),
    email      = coalesce(email, v_from.email),
    profile_id = coalesce(profile_id, v_from.profile_id),
    status     = case when status = 'inactive' and v_from.status = 'active' then 'active'::person_status else status end
  where org_id = p_org and id = p_to;
end $$;

revoke execute on function public.merge_members(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_members(uuid, uuid, uuid) to service_role;
