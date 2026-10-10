-- Who paid the food vendor for one meal slot on one day.
-- Without a row, that meal is owed to the group's collector (org_settings.collector_id).
-- Orders keep their own payee_id (the ledger reads that); this table is what new and
-- re-saved orders for that day/slot pick up.

create table public.meal_payers (
  org_id     uuid not null references public.orgs (id) on delete cascade,
  pay_date   date not null,
  meal       text not null,
  member_id  uuid not null,
  set_by     uuid,
  updated_at timestamptz not null default now(),
  primary key (org_id, pay_date, meal),
  foreign key (org_id, member_id) references public.members (org_id, id) on delete cascade,
  foreign key (org_id, set_by) references public.members (org_id, id) on delete set null (set_by)
);

alter table public.meal_payers enable row level security;
revoke all on public.meal_payers from anon, authenticated;
grant all on public.meal_payers to service_role;
