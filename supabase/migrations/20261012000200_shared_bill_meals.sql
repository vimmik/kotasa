-- Shared-bill meals: instead of everyone ordering their own item, a few full portions are bought
-- and the bill is split equally among whoever eats. People "join" the meal; the bill itself is
-- one or more shared meal items (expenses with meal_date + meal) re-split whenever joins change.

-- Default mode per meal slot (Settings), overridable per day (packing page).
alter table public.org_meal_slots add column pooled boolean not null default false;

create table public.meal_days (
  org_id   uuid not null references public.orgs (id) on delete cascade,
  day      date not null,
  meal     text not null,
  pooled   boolean not null,
  primary key (org_id, day, meal),
  foreign key (org_id, meal) references public.org_meal_slots (org_id, key) on update cascade on delete cascade
);

-- Who is eating a shared-bill meal on a day.
create table public.meal_joins (
  org_id     uuid not null references public.orgs (id) on delete cascade,
  join_date  date not null,
  meal       text not null,
  member_id  uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (org_id, join_date, meal, member_id),
  foreign key (org_id, member_id) references public.members (org_id, id) on delete cascade,
  foreign key (org_id, created_by) references public.members (org_id, id) on delete set null (created_by),
  foreign key (org_id, meal) references public.org_meal_slots (org_id, key) on update cascade on delete cascade
);

alter table public.meal_days  enable row level security;
alter table public.meal_joins enable row level security;
revoke all on public.meal_days, public.meal_joins from anon, authenticated;
grant all on public.meal_days, public.meal_joins to service_role;
