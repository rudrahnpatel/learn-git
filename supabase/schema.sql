-- learn-git accounts: progress sync, account deletion and the /admin view.
-- Run the whole file in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- It is idempotent: re-running it updates the functions and policies and never drops data.
--
-- Security model: the browser only ever has the public anon key. Row-level security limits each
-- signed-in user to their own progress row. Everything else (deleting an account, the admin list,
-- admin edits, bans and admin rights) is a SECURITY DEFINER function with an empty search_path that checks who is
-- calling first. No service-role key is used anywhere.

------------------------------------------------------------------------------ progress
-- One row per user: the whole game state (the 'learn-git:v2' localStorage object) as JSON, plus
-- rev for optimistic concurrency (a client writes rev+1 only "where rev = the rev it read").
create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  rev        integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint progress_state_is_object check (jsonb_typeof(state) = 'object'),
  constraint progress_state_size check (pg_column_size(state) < 1000000)
);
-- (for a table created by an earlier draft of this file)
alter table public.progress add column if not exists rev integer not null default 1;
alter table public.progress add column if not exists updated_at timestamptz not null default now();

-- updated_at is the server's clock, and every update must move rev on by exactly one.
create or replace function public.progress_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'progress.user_id cannot change' using errcode = '42501';
    end if;
    if new.rev is distinct from old.rev + 1 then
      raise exception 'progress.rev must go from % to %', old.rev, old.rev + 1 using errcode = '40001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists progress_touch on public.progress;
create trigger progress_touch
  before insert or update on public.progress
  for each row execute function public.progress_touch();

alter table public.progress enable row level security;

drop policy if exists "progress: read own" on public.progress;
create policy "progress: read own" on public.progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "progress: insert own" on public.progress;
create policy "progress: insert own" on public.progress
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "progress: update own" on public.progress;
create policy "progress: update own" on public.progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- No delete policy: a progress row goes away with its account (on delete cascade).

revoke all on public.progress from anon;
revoke all on public.progress from authenticated;
grant select, insert, update on public.progress to authenticated;

------------------------------------------------------------------------------ admins
-- Emails allowed into /admin. RLS on and no policies, and no grants: the API can't read or
-- write it at all. Add yourself from the SQL editor:
--   insert into public.admins (email) values ('you@example.com') on conflict do nothing;
create table if not exists public.admins (
  email    text primary key,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon;
revoke all on public.admins from authenticated;

------------------------------------------------------------------------------ functions
-- True when the caller's JWT email is in admins. The email must also be confirmed on the account
-- (Google emails always are), so an unconfirmed sign-up that merely claims an admin's address
-- gets nothing even if another auth provider is switched on later.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins a
    join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- The signed-in user deletes their own account; their progress row goes with it (cascade).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end;
$$;

-- Admin: every user with a progress summary, newest first. (Dropped first because its columns grew
-- is_admin and banned; "create or replace" can't change a function's result columns.)
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id              uuid,
  email           text,
  name            text,
  avatar          text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  total_xp        integer,
  streak          integer,
  lessons         integer,
  updated_at      timestamptz,
  is_admin        boolean,
  banned          boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return query
    select
      u.id,
      u.email::text,
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
      coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')::text,
      u.created_at,
      u.last_sign_in_at,
      case when jsonb_typeof(p.state -> 'totalXp') = 'number'
           then floor((p.state ->> 'totalXp')::numeric)::integer else 0 end,
      case when jsonb_typeof(p.state -> 'streak' -> 'count') = 'number'
           then floor((p.state -> 'streak' ->> 'count')::numeric)::integer else 0 end,
      case when jsonb_typeof(p.state -> 'stats' -> 'lessons') = 'number'
           then floor((p.state -> 'stats' ->> 'lessons')::numeric)::integer else 0 end,
      p.updated_at,
      exists (select 1 from public.admins a where lower(a.email) = lower(u.email)),
      coalesce(u.banned_until > now(), false)
    from auth.users u
    left join public.progress p on p.user_id = u.id
    order by u.created_at desc;
end;
$$;

-- Admin: delete a user (and, by cascade, their progress). Not yourself: use delete_my_account().
create or replace function public.admin_delete_user(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if uid = auth.uid() then
    raise exception 'use delete_my_account() to delete your own account' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

------------------------------------------------------------------------------ admin editing
-- Admin edits must survive the devices' max-merge (js/cloud/merge.js). Each edit is written into the
-- state with a stamp, state.adminEdits:
--   fields:  { "totalXp" | "gems" | "streak.freezes" | "streak.count" | "streak.best":
--              { at, to, from, days? } }      at = server time in ms, to = the new value,
--                                             from = the value just before, days = sum of xpByDay before
--   nodes:   { "<path node id>": { at, to: {done, crowns, best} | null, from: {...} | null } }
--   courses: { "git": at }                    the course's progress was reset at that time
-- A device that hasn't seen an edit is moved onto it when it merges: the edited value replaces the one
-- it was made from, and anything the device earned beyond that (play the admin never saw) stays on
-- top. The row is written with rev + 1 (the trigger insists), so a device in the middle of a sync loses
-- its "where rev = n" update, re-reads, merges the edit in and tries again.

-- Admin: one user's saved state, for the edit panel on /admin. Null when they never synced.
create or replace function public.admin_get_progress(uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  res jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  select jsonb_build_object('state', p.state, 'rev', p.rev, 'updated_at', p.updated_at)
    into res from public.progress p where p.user_id = uid;
  return res;
end;
$$;

-- Admin: set progress numbers and path nodes. patch is a JSON object with any of
--   "totalXp", "gems", "streak.freezes", "streak.count", "streak.best": whole numbers >= 0
--   "nodes": { "<unit>:lesson:<id>" | "<unit>:chest:<n>" | "<unit>:review": {"done": bool, "crowns": 0-5} | null }
-- (null, or not done with 0 crowns, removes the node: "not done"). Returns the new state.
create or replace function public.admin_update_progress(uid uuid, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths constant jsonb := '{"totalXp": ["totalXp"], "gems": ["gems"], "streak.freezes": ["streak", "freezes"],
                            "streak.count": ["streak", "count"], "streak.best": ["streak", "best"]}';
  s jsonb; r integer; e jsonb; t bigint; days numeric;
  k text; p text[]; v jsonb; want numeric; cur numeric;
  nid text; nv jsonb; nfrom jsonb; nto jsonb; done boolean; crowns integer;
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if jsonb_typeof(patch) is distinct from 'object' then
    raise exception 'patch must be a JSON object' using errcode = '22023';
  end if;
  select state, rev into s, r from public.progress where user_id = uid for update;
  if not found then
    raise exception 'this user has no synced progress yet' using errcode = 'P0002';
  end if;
  e := coalesce(s -> 'adminEdits', '{}'::jsonb);
  e := jsonb_build_object('fields', coalesce(e -> 'fields', '{}'::jsonb), 'nodes', coalesce(e -> 'nodes', '{}'::jsonb),
                          'courses', coalesce(e -> 'courses', '{}'::jsonb));
  -- server clock; a node edit must come after the last course reset to count
  t := greatest((extract(epoch from clock_timestamp()) * 1000)::bigint,
                coalesce((e -> 'courses' ->> 'git')::bigint, 0) + 1);
  if jsonb_typeof(s -> 'streak') is distinct from 'object' then s := jsonb_set(s, '{streak}', '{}'::jsonb); end if;
  if jsonb_typeof(s -> 'nodes') is distinct from 'object' then s := jsonb_set(s, '{nodes}', '{}'::jsonb); end if;
  select coalesce(sum(case when jsonb_typeof(x.value) = 'number' then (x.value #>> '{}')::numeric else 0 end), 0)
    into days
    from jsonb_each(case when jsonb_typeof(s -> 'xpByDay') = 'object' then s -> 'xpByDay' else '{}'::jsonb end) x;

  for k in select jsonb_object_keys(patch) loop
    continue when k = 'nodes';
    if not paths ? k then
      raise exception 'unknown field %', k using errcode = '22023';
    end if;
    v := patch -> k;
    if jsonb_typeof(v) is distinct from 'number' or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 100000000 then
      raise exception '% must be a whole number from 0', k using errcode = '22023';
    end if;
    want := floor((v #>> '{}')::numeric);
    p := array(select jsonb_array_elements_text(paths -> k));
    cur := case when jsonb_typeof(s #> p) = 'number' then (s #>> p)::numeric else 0 end;
    continue when cur = want;
    s := jsonb_set(s, p, to_jsonb(want), true);
    e := jsonb_set(e, array['fields', k],
                   jsonb_build_object('at', t, 'to', want, 'from', cur)
                   || case when k = 'totalXp' then jsonb_build_object('days', days) else '{}'::jsonb end, true);
  end loop;
  -- a best streak below the current one makes no sense: lift it (raising needs no stamp)
  if coalesce((s #>> '{streak,best}')::numeric, 0) < coalesce((s #>> '{streak,count}')::numeric, 0) then
    s := jsonb_set(s, '{streak,best}', s #> '{streak,count}');
  end if;

  if patch ? 'nodes' then
    if jsonb_typeof(patch -> 'nodes') is distinct from 'object' then
      raise exception 'nodes must be a JSON object' using errcode = '22023';
    end if;
    for nid, nv in select x.key, x.value from jsonb_each(patch -> 'nodes') x loop
      if nid !~ '^[A-Za-z0-9_.-]+:(lesson:[A-Za-z0-9_.-]+|chest:[0-9]+|review)$' then
        raise exception 'not a path node id: %', nid using errcode = '22023';
      end if;
      nfrom := s -> 'nodes' -> nid;
      if jsonb_typeof(nv) = 'null' then
        nto := null;
      elsif jsonb_typeof(nv) = 'object'
            and jsonb_typeof(coalesce(nv -> 'done', 'false')) = 'boolean'
            and jsonb_typeof(coalesce(nv -> 'crowns', '0')) = 'number' then
        done := coalesce((nv ->> 'done')::boolean, false);
        crowns := floor(coalesce((nv ->> 'crowns')::numeric, 0))::integer;
        if crowns < 0 or crowns > 5 then
          raise exception 'crowns must be 0 to 5' using errcode = '22023';
        end if;
        nto := case when not done and crowns = 0 then null
                    else jsonb_build_object('done', done, 'crowns', crowns,
                                            'best', case when done then coalesce(nfrom -> 'best', '0'::jsonb) else '0'::jsonb end) end;
      else
        raise exception 'node % must be {"done": bool, "crowns": 0-5} or null', nid using errcode = '22023';
      end if;
      continue when nto is not distinct from nfrom;
      if nto is null then s := s #- array['nodes', nid];
      else s := jsonb_set(s, array['nodes', nid], nto, true); end if;
      e := jsonb_set(e, array['nodes', nid], jsonb_build_object('at', t, 'to', nto, 'from', nfrom), true);
    end loop;
  end if;

  s := jsonb_set(s, '{adminEdits}', e, true);
  update public.progress set state = s, rev = r + 1 where user_id = uid;
  return s;
end;
$$;

-- Admin: reset one course's progress (path nodes, challenges, mistakes deck, command cards). XP,
-- cherries, streak and achievements are not the course's and stay. Only 'git' exists so far.
create or replace function public.admin_reset_course(uid uuid, course text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb; r integer; e jsonb; t bigint;
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if course is distinct from 'git' then
    raise exception 'unknown course %', course using errcode = '22023';
  end if;
  select state, rev into s, r from public.progress where user_id = uid for update;
  if not found then
    raise exception 'this user has no synced progress yet' using errcode = 'P0002';
  end if;
  e := coalesce(s -> 'adminEdits', '{}'::jsonb);
  e := jsonb_build_object('fields', coalesce(e -> 'fields', '{}'::jsonb), 'nodes', '{}'::jsonb,   -- node edits end here
                          'courses', coalesce(e -> 'courses', '{}'::jsonb));
  t := greatest((extract(epoch from clock_timestamp()) * 1000)::bigint,
                coalesce((e -> 'courses' ->> course)::bigint, 0) + 1);
  -- the git course's fields predate the per-course layer and live at the top level (js/storage.js)
  s := s || jsonb_build_object('nodes', '{}'::jsonb, 'challenges', '{}'::jsonb, 'mistakes', '{}'::jsonb);
  s := jsonb_set(s, '{courses}',
                 case when jsonb_typeof(s -> 'courses') = 'object' then s -> 'courses' else '{}'::jsonb end
                 || jsonb_build_object(course,
                      case when jsonb_typeof(s -> 'courses' -> course) = 'object' then s -> 'courses' -> course else '{}'::jsonb end
                      || '{"cards": {}, "seenCards": {}}'::jsonb), true);
  e := jsonb_set(e, array['courses', course], to_jsonb(t), true);
  s := jsonb_set(s, '{adminEdits}', e, true);
  update public.progress set state = s, rev = r + 1 where user_id = uid;
  return s;
end;
$$;

-- Admin: give or take admin rights by email. Nobody can take their own away (so there's always
-- at least the one admin who is doing this).
create or replace function public.admin_set_admin(target_email text, make boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  addr text := lower(trim(coalesce(target_email, '')));
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if addr !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    raise exception 'not an email address: %', target_email using errcode = '22023';
  end if;
  if make then
    insert into public.admins (email) values (addr) on conflict do nothing;
  else
    if addr = lower(coalesce(auth.jwt() ->> 'email', '')) then
      raise exception 'you can''t remove your own admin rights' using errcode = '42501';
    end if;
    delete from public.admins a where lower(a.email) = addr;
  end if;
end;
$$;

-- Admin: ban (no new sign-ins or token refreshes, and their sessions are ended) or unban a user.
-- A ban lasts 100 years, which is what "forever" means to Supabase Auth. Not yourself.
create or replace function public.admin_set_banned(uid uuid, banned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if uid = auth.uid() then
    raise exception 'you can''t ban yourself' using errcode = '42501';
  end if;
  update auth.users set banned_until = case when banned then now() + interval '100 years' else null end
    where id = uid;
  if not found then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
  if banned then
    delete from auth.sessions where user_id = uid;   -- their refresh tokens go with the sessions
  end if;
end;
$$;

-- Only signed-in users may call these (each still checks who is calling).
revoke all on function public.is_admin() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
revoke all on function public.admin_get_progress(uuid) from public, anon;
revoke all on function public.admin_update_progress(uuid, jsonb) from public, anon;
revoke all on function public.admin_reset_course(uuid, text) from public, anon;
revoke all on function public.admin_set_admin(text, boolean) from public, anon;
revoke all on function public.admin_set_banned(uuid, boolean) from public, anon;
grant execute on function public.admin_get_progress(uuid) to authenticated;
grant execute on function public.admin_update_progress(uuid, jsonb) to authenticated;
grant execute on function public.admin_reset_course(uuid, text) to authenticated;
grant execute on function public.admin_set_admin(text, boolean) to authenticated;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;


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
