-- "Fewest payments" asked people to pay strangers. Matching everyone's net biggest-first ignores
-- who actually shared what: if A, B, C, D eat breakfast (A pays) and B, D, F, G eat lunch (D pays),
-- F could be told to pay A, who F never ate with. Totals were right, but people got confused.
--
-- Now simplifying starts from the real person-to-person balances and only shortens a chain
-- (X owes Y, Y owes Z -> X pays Z directly) when X already knows Z: they share a ledger line in
-- this group (an expense, a meal, a payment...), or Z is the group's collector. People X knows
-- come first, then the collector. Each step removes a payment and never adds one, so this never
-- needs more payments than plain balances; it may need a few more than the strict minimum.
create or replace function public.group_balances(
  p_org uuid, p_until date default '9999-12-31', p_circle uuid default null)
returns table (debtor uuid, creditor uuid, amount numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_flow  jsonb;  -- "debtor:creditor" -> amount to pay
  v_known jsonb;  -- "a:b" -> true when a and b share a ledger line (both orders)
  v_coll  text;
  v_xz numeric;
  r record;
  i int := 0;
begin
  if p_circle is not null
     or not coalesce((select s.simplify_debts from org_settings s where s.org_id = p_org), false) then
    return query select p.debtor, p.creditor, p.amount from pair_balances(p_org, p_until, p_circle) p;
    return;
  end if;

  select coalesce(jsonb_object_agg(p.debtor::text || ':' || p.creditor::text, p.amount), '{}') into v_flow
  from pair_balances(p_org, p_until, null) p;

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

    -- X pays Z the part that was only passing through Y.
    v_xz := coalesce((v_flow->>(r.x || ':' || r.z))::numeric, 0) + r.m
            - coalesce((v_flow->>(r.z || ':' || r.x))::numeric, 0);
    v_flow := v_flow || jsonb_build_object(
      r.x || ':' || r.y, (v_flow->>(r.x || ':' || r.y))::numeric - r.m,
      r.y || ':' || r.z, (v_flow->>(r.y || ':' || r.z))::numeric - r.m,
      r.x || ':' || r.z, greatest(v_xz, 0),
      r.z || ':' || r.x, greatest(-v_xz, 0));
  end loop;

  return query
    select split_part(f.key, ':', 1)::uuid, split_part(f.key, ':', 2)::uuid, f.value::numeric
    from jsonb_each_text(v_flow) f
    where f.value::numeric >= 0.01;
end $$;

revoke execute on function public.group_balances(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.group_balances(uuid, date, uuid) to service_role;
