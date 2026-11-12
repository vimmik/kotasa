-- 1. Split a bill by item. expenses.bill keeps what the bill said (items, who had each one,
--    charges like tax/delivery/service, discounts), so the expense can be shown and edited the
--    same way. Shares are still worked out by the app and saved in expense_shares as before
--    (split_type 'custom'), so the ledger, balances and closing don't change.
--    Shape: {"items":[{"name":text,"amount":num,"people":[member uuid]}],
--            "extras":[{"label":text,"amount":num,"kind":"charge"|"discount"}]}
alter table public.expenses
  add column if not exists bill jsonb check (bill is null or jsonb_typeof(bill) = 'object');

-- 2. Where to send money. A person's bank details (on their profile, used in every group), and an
--    optional different one for one group (on their member row; also how a guest gets one).
--    Shown to people who owe them: Home, the bill link, the payment page and the SMS.
alter table public.profiles
  add column if not exists pay_details text check (pay_details is null or char_length(pay_details) <= 120);
alter table public.members
  add column if not exists pay_details text check (pay_details is null or char_length(pay_details) <= 120);

-- 3. How often the group's SMS goes out. weekly = billing_weekday (as before); daily = every day;
--    monthly = billing_monthday (29-31 mean the last day of a shorter month).
alter table public.org_settings
  add column if not exists sms_frequency text not null default 'weekly'
    check (sms_frequency in ('daily', 'weekly', 'monthly')),
  add column if not exists billing_monthday int not null default 31
    check (billing_monthday between 1 and 31);

-- 4. Bill photo scans (they cost money per scan), counted to keep a daily limit per group.
create table if not exists public.receipt_scans (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  member_id   uuid not null,
  ok          boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (org_id, member_id) references public.members (org_id, id) on delete cascade
);
create index if not exists receipt_scans_org_idx on public.receipt_scans (org_id, created_at);
alter table public.receipt_scans enable row level security;
revoke all on public.receipt_scans from anon, authenticated;
