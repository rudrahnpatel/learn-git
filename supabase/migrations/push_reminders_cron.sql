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

-- Every hour on the hour (UTC). A device is due when ITS local hour equals its reminder hour, so in
-- whole-hour zones the reminder lands at hh:00. In half-hour zones (India +5:30, ...) the run at
-- :00 UTC is :30 local, so a 19:00 reminder arrives at 19:30. To make those land on the hour too,
-- use '0,30 * * * *' (or '*/15 * * * *' for +5:45): the function is idempotent per local day, so
-- extra runs never send twice.
select cron.schedule(
  'learn-git-send-reminders',
  '0 * * * *',
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
