-- The weekly SMS used to run from one Vercel cron a day (09:30 UTC = 15:00 Colombo), so a group whose
-- "From hour" was later than 15 never got its SMS: at 15:00 it was "too early" and nothing ran again.
-- pg_cron now calls /api/cron/weekly-sms every hour at :30 UTC, which is :00 in Colombo (UTC+5:30), so
-- each group sends right at its own hour. The route skips people already sent that week, so hourly runs
-- are safe.
--
-- The app URL and CRON_SECRET live in Supabase Vault, not in this file. Set them once per database:
--   select vault.create_secret('https://<app domain>', 'kotasa_app_url');
--   select vault.create_secret('<CRON_SECRET>', 'kotasa_cron_secret');
-- Until both exist the job does nothing (dev and QA stay quiet).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.run_weekly_sms_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'kotasa_app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'kotasa_cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;
  -- Long timeout: a run that sends to many people takes a while, and the request should not be cut off.
  perform net.http_get(
    url := rtrim(v_url, '/') || '/api/cron/weekly-sms',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.run_weekly_sms_cron() from public, anon, authenticated;

-- Scheduling by name replaces an existing job with the same name, so rerunning this is safe.
select cron.schedule('kotasa-weekly-sms', '30 * * * *', 'select public.run_weekly_sms_cron()');
