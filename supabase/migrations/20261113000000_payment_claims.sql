-- Payments made earlier, and people who already settled.
--
-- 1. "Paid earlier" (settlement_claims). B paid A cash last week but nobody recorded it. New
--    expenses came in, "Fewest payments" moved B's debt to someone else, and B was about to pay
--    it twice. Now B can record a payment with an earlier date, but it waits for A (the person
--    who got the money) to confirm before it counts. Until then it is not in the ledger.
--    * The receiver confirms. When the receiver has no app (a guest), someone with
--      settle.record_any confirms, never the person who recorded it.
--    * confirm_settlement_claim() saves the payment once (client_key = the claim id). If its date
--      is closed by then, it is saved today with "paid <date>" in its label.
--
-- 2. Someone who is owed overall, or settled, is never told to pay. Recording a payment between
--    two people (or a new expense between others) could re-route the chains in "Fewest payments"
--    so that a third person who had nothing to pay got "you owe X" and "Y owes you" for the same
--    amount (about 1 in 100 cases in a fuzz test). pass_through() now runs last: whatever only
--    passes through a person whose net is >= 0 is paid directly by the debtor to the creditor,
--    even if those two never shared an expense (the 20261016 rule gives way here). Nets never
--    change. Only with simplify_debts on; with it off, balances are plain pairs as before.

-- ---------- 1. Payments waiting for confirmation ----------

create table public.settlement_claims (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  from_person   uuid not null,
  to_person     uuid not null,
  amount        numeric(12,2) not null check (amount > 0),
  paid_on       date not null,
  note          text,
  recorded_by   uuid,
  client_key    uuid,
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  decided_by    uuid,
  decided_at    timestamptz,
  settlement_id uuid references public.settlements (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (from_person <> to_person),
  foreign key (org_id, from_person) references public.members (org_id, id) on delete cascade,
  foreign key (org_id, to_person) references public.members (org_id, id) on delete cascade,
  foreign key (org_id, recorded_by) references public.members (org_id, id) on delete set null (recorded_by),
  foreign key (org_id, decided_by) references public.members (org_id, id) on delete set null (decided_by)
);
create index settlement_claims_org_status_idx on public.settlement_claims (org_id, status);
create unique index settlement_claims_client_key_idx
  on public.settlement_claims (org_id, client_key) where client_key is not null;
alter table public.settlement_claims enable row level security;

-- Save a waiting payment as a real one. Returns the payment, the date it was saved with, and the
-- claim's status ('confirmed'; or its current status when it was not pending: nothing saved).
create or replace function public.confirm_settlement_claim(p_org uuid, p_claim uuid, p_by uuid, p_today date)
returns table (settlement_id uuid, paid_on date, status text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  c settlement_claims%rowtype;
  v_through date;
  v_date date;
  v_note text;
  v_id uuid;
begin
  select * into c from settlement_claims s where s.org_id = p_org and s.id = p_claim for update;
  if not found then
    return;
  end if;
  if c.status <> 'pending' then
    return query select c.settlement_id, c.paid_on, c.status;
    return;
  end if;

  v_date := c.paid_on;
  v_note := c.note;
  select max(oc.closed_through) into v_through from org_closings oc where oc.org_id = p_org;
  if v_through is not null and c.paid_on <= v_through then
    v_date := greatest(p_today, v_through + 1);
    v_note := coalesce(nullif(btrim(c.note), ''), 'Payment') || ' · paid ' || to_char(c.paid_on, 'FMDD Mon YYYY');
  end if;

  insert into settlements (org_id, from_person, to_person, amount, paid_on, note, recorded_by, client_key)
  values (p_org, c.from_person, c.to_person, c.amount, v_date, v_note, c.recorded_by, c.id)
  returning settlements.id into v_id;

  update settlement_claims s
  set status = 'confirmed', decided_by = p_by, decided_at = now(), settlement_id = v_id
  where s.id = c.id;
  return query select v_id, v_date, 'confirmed'::text;
end $$;

revoke execute on function public.confirm_settlement_claim(uuid, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.confirm_settlement_claim(uuid, uuid, uuid, date) to service_role;

-- ---------- 2. Nobody who is owed overall pays ----------

-- p_flow: "debtor:creditor" -> amount. While someone with net >= 0 has something to pay, take a
-- debt that comes into them (X owes Y) and one going out (Y owes Z) and let X pay Z directly.
-- People who share a ledger line come first. Each step moves less money in total, so it ends.
create or replace function public.pass_through(p_org uuid, p_flow jsonb, p_until date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_flow  jsonb := p_flow;
  v_known jsonb;
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

  loop
    i := i + 1;
    exit when i > 10000; -- each step cuts the total moved by >= 0.01, so this is only a guard

    with f as (
      select split_part(e.key, ':', 1) as d, split_part(e.key, ':', 2) as c, e.value::numeric as a
      from jsonb_each_text(v_flow) e where e.value::numeric >= 0.01
    ),
    net as (
      select t.p, sum(t.v) as v
      from (select f.c as p, f.a as v from f union all select f.d, -f.a from f) t
      group by t.p
    )
    select n.d as x, o.d as y, o.c as z, least(n.a, o.a) as m into r
    from f o
    join net on net.p = o.d and net.v >= -0.005
    join f n on n.c = o.d and n.d <> o.c
    order by (v_known ? (n.d || ':' || o.c)) desc, least(n.a, o.a) desc, n.d, o.d, o.c
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

revoke execute on function public.pass_through(uuid, jsonb, date) from public, anon, authenticated;
grant execute on function public.pass_through(uuid, jsonb, date) to service_role;

-- Same as 20261023, plus pass_through() on the final balances when simplifying.
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
  v_both     jsonb;
  v_final    jsonb;
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
    -- A payment the other way pays off the frozen amount first; only what's left over is new.
    paid as (
      select a, b, r,
             case when f * p < 0 then (case when abs(p) <= abs(f) then f + p else 0 end) else f end as f,
             case when f * p < 0 then (case when abs(p) <= abs(f) then 0 else f + p end) else p end as p
      from j
    ),
    -- Then anything else new the other way nets against what's left of it.
    applied as (
      select a, b,
             case when f * (p + r) < 0 then (case when abs(p + r) <= abs(f) then f + p + r else 0 end) else f end as f,
             case when f * (p + r) < 0 then (case when abs(p + r) <= abs(f) then 0 else f + p + r end) else p + r end as n
      from paid
    )
    select
      coalesce(jsonb_object_agg(case when x.f > 0 then x.a || ':' || x.b else x.b || ':' || x.a end, abs(x.f))
                 filter (where abs(x.f) >= 0.01), '{}'),
      coalesce(jsonb_object_agg(case when x.n > 0 then x.a || ':' || x.b else x.b || ':' || x.a end, abs(x.n))
                 filter (where abs(x.n) >= 0.01), '{}')
      into v_frozen, v_flow
    from applied x;
  end if;

  if v_simplify and v_close is null then
    v_flow := simplify_flows(p_org, v_flow, p_until); -- no close: exactly as before
  elsif v_simplify then
    v_both := simplify_with_frozen(p_org, v_flow, v_frozen, p_until);
    v_flow := v_both->'flow';
    v_frozen := v_both->'frozen';
  end if;

  -- Frozen + new, netted per pair.
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
  select coalesce(jsonb_object_agg(case when v > 0 then a || ':' || b else b || ':' || a end, abs(v))
                    filter (where abs(v) >= 0.01), '{}')
    into v_final
  from net;

  if v_simplify then
    v_final := pass_through(p_org, v_final, p_until);
  end if;

  return query
    select split_part(e.key, ':', 1)::uuid, split_part(e.key, ':', 2)::uuid, round(e.value::numeric, 2)
    from jsonb_each_text(v_final) e
    where e.value::numeric >= 0.01;
end $$;

revoke execute on function public.group_balances(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.group_balances(uuid, date, uuid) to service_role;
