-- Hourly schedule for the send-reminders Edge Function (pg_cron + pg_net).
-- Run this AFTER push_reminders.sql (or schema.sql), after deploying the function, and after
-- creating the two Vault secrets it reads (supabase/README.md, "Push reminders", steps 4-6):
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'learn_git_project_url');
--   select vault.create_secret('<the REMINDER_SECRET you set on the function>', 'learn_git_reminder_secret');
--
-- Nothing secret is written in this file: the URL and the shared secret come from Vault at run time.
-- Safe to run again: cron.schedule() with an existing job name updates that job.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Every half hour (UTC). A device is due when ITS local hour equals its reminder hour, and the
-- function sends at most once per device per local day, so the extra run is harmless: in whole-hour
-- zones the reminder lands at hh:00 (the :30 run finds it already sent), and in half-hour zones
-- (India +5:30, ...) the :30 UTC run is hh:00 local, so a 19:00 reminder arrives at 19:00, not 19:30.
-- For +5:45 zones use '*/15 * * * *'.
select cron.schedule(
  'learn-git-send-reminders',
  '0,30 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'learn_git_project_url')
           || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'learn_git_reminder_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Handy checks (run by hand):
--   select * from cron.job where jobname = 'learn-git-send-reminders';
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select id, status_code, content from net._http_response order by created desc limit 10;
-- Stop it:
--   select cron.unschedule('learn-git-send-reminders');
