-- Two money-safety fixes.
--
-- 1. Recording a payment twice. A slow page or a second tap could save the same payment again.
--    * settlements.client_key: one key per payment form. The same form sent twice saves once.
--    * record_settlement(): saves a payment, one at a time per pair of people, and refuses one
--      that looks like a repeat (same people, same amount, last 10 minutes) unless the person
--      confirms it is a second payment.
--
-- 2. Closed books and payments to "someone else" (fixes 20261018). After a close, frozen amounts
--    were only paid off by payments between the same two people. If C was told to pay A but
--    paid B (whom C really owed before "Fewest payments"), C still owed A and B now owed C, and
--    money could go round in a circle (A -> B -> C -> A). Now:
--    * New activity between two people first nets against their own frozen amount.
--    * Chain shortening may also run through a frozen amount, but only when the chain starts with
--      something new: someone owes X something new and X has a frozen debt to Z, so they pay Z
--      directly. A frozen amount therefore only changes when one of its two people pays, gets
--      paid, or is owed something new. Nobody's total ever changes because of it.

-- ---------- 1. Payments ----------

alter table public.settlements add column if not exists client_key uuid;
create unique index if not exists settlements_client_key_idx
  on public.settlements (org_id, client_key) where client_key is not null;

-- status: 'saved' (new row), 'exists' (this key was already saved), 'duplicate' (looks like a
-- repeat of `id`, nothing saved). The closed-books trigger still applies.
create or replace function public.record_settlement(
  p_org uuid, p_from uuid, p_to uuid, p_amount numeric, p_paid_on date, p_note text,
  p_by uuid, p_key uuid, p_allow_duplicate boolean default false)
returns table (id uuid, status text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_at timestamptz;
begin
  -- One payment at a time per pair, so two quick taps can't both pass the checks below.
  perform pg_advisory_xact_lock(hashtextextended(
    p_org::text || ':' || least(p_from, p_to)::text || ':' || greatest(p_from, p_to)::text, 0));

  if p_key is not null then
    select s.id, s.created_at into v_id, v_at from settlements s where s.org_id = p_org and s.client_key = p_key;
    if v_id is not null then
      return query select v_id, 'exists'::text, v_at;
      return;
    end if;
  end if;

  if not p_allow_duplicate then
    select s.id, s.created_at into v_id, v_at from settlements s
    where s.org_id = p_org and s.from_person = p_from and s.to_person = p_to and s.amount = p_amount
      and s.created_at > now() - interval '10 minutes'
    order by s.created_at desc limit 1;
    if v_id is not null then
      return query select v_id, 'duplicate'::text, v_at;
      return;
    end if;
  end if;

  insert into settlements (org_id, from_person, to_person, amount, paid_on, note, recorded_by, client_key)
  values (p_org, p_from, p_to, p_amount, p_paid_on, p_note, p_by, p_key)
  returning settlements.id, settlements.created_at into v_id, v_at;
  return query select v_id, 'saved'::text, v_at;
end $$;

revoke execute on function public.record_settlement(uuid, uuid, uuid, numeric, date, text, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.record_settlement(uuid, uuid, uuid, numeric, date, text, uuid, uuid, boolean)
  to service_role;

-- ---------- 2. Balances with a close in force ----------

-- simplify_flows (20261018) with frozen amounts. p_flow can be shortened freely; p_frozen only as
-- the second step of a chain (X owes Y something new, Y has a frozen debt to Z -> X pays Z).
-- Returns {"flow": ..., "frozen": ...}, both "debtor:creditor" -> amount.
create or replace function public.simplify_with_frozen(p_org uuid, p_flow jsonb, p_frozen jsonb, p_until date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_flow   jsonb := p_flow;
  v_frozen jsonb := p_frozen;
  v_known  jsonb;
  v_coll   text;
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
    exit when i > 10000; -- each step cuts the total owed by >= 0.01, so this is only a guard

    with f as (
      select split_part(e.key, ':', 1) as d, split_part(e.key, ':', 2) as c, e.value::numeric as a, false as fixed
      from jsonb_each_text(v_flow) e where e.value::numeric >= 0.01
      union all
      select split_part(e.key, ':', 1), split_part(e.key, ':', 2), e.value::numeric, true
      from jsonb_each_text(v_frozen) e where e.value::numeric >= 0.01
    )
    select f1.d as x, f1.c as y, f2.c as z, least(f1.a, f2.a) as m, f2.fixed as fixed into r
    from f f1 join f f2 on f2.d = f1.c and f2.c <> f1.d
    where not f1.fixed
      and (v_known ? (f1.d || ':' || f2.c) or f2.c = v_coll
           -- X and Z already have a balance between them (this also breaks up circles)
           or exists (select 1 from f f3 where (f3.d = f1.d and f3.c = f2.c) or (f3.d = f2.c and f3.c = f1.d)))
    order by (v_known ? (f1.d || ':' || f2.c)) desc, f2.fixed, least(f1.a, f2.a) desc, f1.d, f1.c, f2.c
    limit 1;
    exit when not found;

    v_xz := coalesce((v_flow->>(r.x || ':' || r.z))::numeric, 0) + r.m
            - coalesce((v_flow->>(r.z || ':' || r.x))::numeric, 0);
    v_flow := v_flow || jsonb_build_object(
      r.x || ':' || r.y, (v_flow->>(r.x || ':' || r.y))::numeric - r.m,
      r.x || ':' || r.z, greatest(v_xz, 0),
      r.z || ':' || r.x, greatest(-v_xz, 0));
    if r.fixed then
      v_frozen := v_frozen || jsonb_build_object(r.y || ':' || r.z, (v_frozen->>(r.y || ':' || r.z))::numeric - r.m);
    else
      v_flow := v_flow || jsonb_build_object(r.y || ':' || r.z, (v_flow->>(r.y || ':' || r.z))::numeric - r.m);
    end if;
  end loop;
  return jsonb_build_object('flow', v_flow, 'frozen', v_frozen);
end $$;

revoke execute on function public.simplify_with_frozen(uuid, jsonb, jsonb, date) from public, anon, authenticated;
grant execute on function public.simplify_with_frozen(uuid, jsonb, jsonb, date) to service_role;

-- Same as 20261018 (and unchanged with no close in force), except that everything new between two people (payments first, then the
-- rest) nets against their frozen amount, and simplifying may run through frozen amounts.
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
