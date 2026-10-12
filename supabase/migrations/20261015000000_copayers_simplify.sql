-- Several people paying one bill, and settling up with the fewest payments.
--
-- Co-payers: the main payer (expenses.paid_by, or the meal's payer) is still owed everyone's
-- share. Each co-payer chipped in part of the bill, so the main payer owes them that part.
-- Net effect: everyone is owed exactly what they paid minus what they ate.
--
-- Simplify debts (per group, on by default): instead of person-to-person balances, everyone's
-- net is settled with the fewest payments, so each person usually pays just one other person.

create table public.expense_copayers (
  org_id      uuid not null references public.orgs (id) on delete cascade,
  expense_id  uuid not null,
  member_id   uuid not null,
  amount      numeric(12,2) not null check (amount > 0),
  primary key (expense_id, member_id),
  foreign key (org_id, expense_id) references public.expenses (org_id, id) on delete cascade,
  foreign key (org_id, member_id) references public.members (org_id, id)
);

create table public.meal_copayers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  pay_date   date not null,
  meal       text not null,
  member_id  uuid not null,              -- chipped in
  payer_id   uuid not null,              -- the meal's main payer, who owes them
  amount     numeric(12,2) not null check (amount > 0),
  unique (org_id, pay_date, meal, member_id),
  check (member_id <> payer_id),
  foreign key (org_id, member_id) references public.members (org_id, id),
  foreign key (org_id, payer_id) references public.members (org_id, id),
  foreign key (org_id, meal) references public.org_meal_slots (org_id, key) on update cascade
);

alter table public.expense_copayers enable row level security;
alter table public.meal_copayers    enable row level security;
revoke all on public.expense_copayers, public.meal_copayers from anon, authenticated;
grant all on public.expense_copayers, public.meal_copayers to service_role;

alter table public.org_settings add column simplify_debts boolean not null default true;

-- Same columns as before, plus the two co-payer branches.
create or replace view public.ledger with (security_invoker = true) as
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
  from public.settlements t
  union all
  select e.org_id, e.paid_by, c.member_id, c.amount,
         e.expense_date, 'expense', e.id, e.title || ' (paid part)', e.circle_id
  from public.expense_copayers c join public.expenses e on e.id = c.expense_id
  where c.member_id <> e.paid_by
  union all
  select c.org_id, c.payer_id, c.member_id, c.amount,
         c.pay_date, 'meal', c.id, coalesce(ms.label, initcap(c.meal)) || ' bill (paid part)', null::uuid
  from public.meal_copayers c
  left join public.org_meal_slots ms on ms.org_id = c.org_id and ms.key = c.meal;

revoke all on public.ledger from anon, authenticated;

-- What everyone should pay whom. With simplify_debts on (and no circle asked for), each
-- person's net is matched biggest-first, debtors to creditors: at most (people - 1) payments,
-- and usually one payment per person. Otherwise the plain pairwise balances.
create or replace function public.group_balances(
  p_org uuid, p_until date default '9999-12-31', p_circle uuid default null)
returns table (debtor uuid, creditor uuid, amount numeric)
language sql stable security definer set search_path = public as $$
  with
  pairs as (select * from public.pair_balances(p_org, p_until, p_circle)),
  simplify as (
    select p_circle is null and coalesce((select s.simplify_debts from public.org_settings s where s.org_id = p_org), false) as enabled
  ),
  net as (
    select x.id, sum(x.v) as v
    from (select p.creditor as id, p.amount as v from pairs p
          union all
          select p.debtor, -p.amount from pairs p) x
    group by x.id
    having abs(sum(x.v)) >= 0.01
  ),
  d as (
    select n.id, sum(-n.v) over (order by -n.v desc, n.id) as hi, -n.v as amt from net n where n.v < 0
  ),
  c as (
    select n.id, sum(n.v) over (order by n.v desc, n.id) as hi, n.v as amt from net n where n.v > 0
  ),
  flows as (
    select d.id as debtor, c.id as creditor,
           least(d.hi, c.hi) - greatest(d.hi - d.amt, c.hi - c.amt) as amount
    from d join c on d.hi - d.amt < c.hi and c.hi - c.amt < d.hi
  )
  select p.debtor, p.creditor, p.amount from pairs p where not (select enabled from simplify)
  union all
  select f.debtor, f.creditor, f.amount from flows f where (select enabled from simplify) and f.amount >= 0.01;
$$;

revoke execute on function public.group_balances(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.group_balances(uuid, date, uuid) to service_role;

-- Merging two member rows (20261014) now also moves co-payments.
create or replace function public.merge_members(p_org uuid, p_from uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_from public.members;
  v_to   public.members;
begin
  if p_from = p_to then return; end if;
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

  delete from public.members where org_id = p_org and id = p_from;

  -- The one that stays keeps its own details and fills the gaps from the duplicate.
  update public.members set
    phone      = coalesce(phone, v_from.phone),
    email      = coalesce(email, v_from.email),
    profile_id = coalesce(profile_id, v_from.profile_id),
    status     = case when status = 'inactive' and v_from.status = 'active' then 'active'::person_status else status end
  where org_id = p_org and id = p_to;
end $$;

