-- "How to pay": a short note from the group (bank account, "cash to Kavi at the office"…) shown on
-- the public bill and on Home, so people who get the weekly SMS know how to pay. Empty = not shown.
alter table public.org_settings
  add column if not exists pay_note text check (pay_note is null or char_length(pay_note) <= 300);
