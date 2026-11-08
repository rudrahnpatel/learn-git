-- ==== push reminders ====
-- Daily push reminders (Web Push / VAPID). One row per device that turned "Daily reminder" on in
-- the account panel. The send-reminders Edge Function (service role) reads every enabled row each
-- hour and pushes to the devices whose local hour equals reminder_hour, whose player hasn't
-- practised today (from progress.state.xpByDay / goalDays) and that weren't sent one today.
-- Idempotent; the same SQL is at the end of schema.sql. The hourly schedule is separate:
-- push_reminders_cron.sql (needs pg_cron + pg_net and two Vault secrets, see README).
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint      text not null unique,             -- the push service URL for this browser
  keys          jsonb not null,                   -- { p256dh, auth } from PushSubscription.toJSON()
  time_zone     text not null default 'UTC',      -- IANA zone of the device, e.g. Asia/Kolkata
  reminder_hour smallint not null default 19,     -- local hour, 0-23
  enabled       boolean not null default true,
  last_sent     date,                             -- local date of the last reminder sent
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint push_endpoint_https check (endpoint ~ '^https://' and length(endpoint) < 1024),
  constraint push_keys_shape check (
    jsonb_typeof(keys) = 'object' and keys ? 'p256dh' and keys ? 'auth'
    and length(keys ->> 'p256dh') between 16 and 256 and length(keys ->> 'auth') between 8 and 64),
  constraint push_hour_range check (reminder_hour between 0 and 23),
  constraint push_tz_length check (length(time_zone) between 1 and 64)
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

-- updated_at on the server clock, the owner can't change, the zone must be one Postgres knows,
-- and at most 10 devices per account.
create or replace function public.push_subscriptions_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'push_subscriptions.user_id cannot change' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or new.time_zone is distinct from old.time_zone then
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
      raise exception 'unknown time zone %', new.time_zone using errcode = '22023';
    end if;
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.push_subscriptions where user_id = new.user_id) >= 10 then
    raise exception 'too many devices with reminders on' using errcode = '54000';
  end if;
  return new;
end;
$$;
drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
create trigger push_subscriptions_touch
  before insert or update on public.push_subscriptions
  for each row execute function public.push_subscriptions_touch();

alter table public.push_subscriptions enable row level security;

drop policy if exists "push: read own" on public.push_subscriptions;
create policy "push: read own" on public.push_subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "push: insert own" on public.push_subscriptions;
create policy "push: insert own" on public.push_subscriptions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "push: update own" on public.push_subscriptions;
create policy "push: update own" on public.push_subscriptions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "push: delete own" on public.push_subscriptions;
create policy "push: delete own" on public.push_subscriptions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Column grants: the browser sets the subscription and its settings; last_sent, the timestamps and
-- the owner are the server's. The service role (Edge Function) bypasses RLS and gets everything.
revoke all on public.push_subscriptions from anon;
revoke all on public.push_subscriptions from authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, keys, time_zone, reminder_hour, enabled) on public.push_subscriptions to authenticated;
grant update (keys, time_zone, reminder_hour, enabled) on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select on public.progress to service_role;
