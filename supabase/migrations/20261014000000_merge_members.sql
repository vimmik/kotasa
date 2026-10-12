-- One person, one member row per group.
-- Duplicates happened when a guest (added by mobile) later joined with Google through a general
-- invite link, or when two Kotasa accounts were joined into one. merge_members() moves all of the
-- duplicate's history onto the member that stays, then deletes the duplicate.

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

revoke execute on function public.merge_members(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_members(uuid, uuid, uuid) to service_role;

-- Members who joined with an account kept no mobile number / email in the group, so the People
-- page showed "—" and the weekly SMS skipped them. Fill the gaps from their account, unless
-- someone else in that group already uses the value.
update public.members m set phone = p.phone
from public.profiles p
where m.profile_id = p.id and m.phone is null and p.phone is not null
  and not exists (select 1 from public.members o where o.org_id = m.org_id and o.phone = p.phone);

update public.members m set email = p.email
from public.profiles p
where m.profile_id = p.id and m.email is null and p.email is not null
  and not exists (select 1 from public.members o where o.org_id = m.org_id and o.email = p.email);
