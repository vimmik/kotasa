-- Shared meal items: a family pack, drinks, a delivery charge… bought for one meal slot on one day
-- and split among the people who ate. They're ordinary expenses (so the ledger, SMS and bill
-- links already handle them), tagged with the day + slot they belong to.

alter table public.expenses
  add column meal_date date,
  add column meal      text,
  add constraint expenses_meal_both check ((meal_date is null) = (meal is null));

create index expenses_org_meal_idx on public.expenses (org_id, meal_date) where meal_date is not null;
