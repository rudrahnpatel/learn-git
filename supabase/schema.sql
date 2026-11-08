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
--              { at, to, from, days?, base? } }  at = server time in ms, to = the new value,
--                                             from = the value just before, days = sum of xpByDay before,
--                                             base = the new wallet base (gems and streak.freezes)
-- Cherries (gems) and stashes (streak.freezes) are ledger balances (js/wallet.js, 2026-11-08):
--   state.wallet.{gems|freezes} = { base, earn: {<key>: n}, spend: {<key>: n} },
--   balance = base + sum(earn) - sum(spend), and state.gems / state.streak.freezes only mirror it.
-- An edit sets the base so the balance is exactly `to` over the counters the cloud has now, and keeps
-- the counters: a device's earning/spending the cloud hasn't seen yet then lands on top exactly once.
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
  wallets constant jsonb := '{"gems": "gems", "streak.freezes": "freezes"}';   -- edit key -> wallet account
  s jsonb; r integer; e jsonb; t bigint; days numeric;
  wk text; acc jsonb; earned numeric; spent numeric; nbase numeric;
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
    if wallets ? k then
      -- a ledger balance: move the base, keep the counters, write the mirror
      wk := wallets ->> k;
      acc := case when jsonb_typeof(s -> 'wallet' -> wk) = 'object' then s -> 'wallet' -> wk
                  -- a save from before the ledger: its plain number is the base (as js/storage.js migrates it)
                  else jsonb_build_object('base', greatest(cur, 0)) end;
      acc := jsonb_build_object(
        'base', case when jsonb_typeof(acc -> 'base') = 'number' then acc -> 'base' else '0'::jsonb end,
        'earn', case when jsonb_typeof(acc -> 'earn') = 'object' then acc -> 'earn' else '{}'::jsonb end,
        'spend', case when jsonb_typeof(acc -> 'spend') = 'object' then acc -> 'spend' else '{}'::jsonb end);
      select coalesce(sum(greatest((x.value #>> '{}')::numeric, 0)), 0) into earned
        from jsonb_each(acc -> 'earn') x where jsonb_typeof(x.value) = 'number';
      select coalesce(sum(greatest((x.value #>> '{}')::numeric, 0)), 0) into spent
        from jsonb_each(acc -> 'spend') x where jsonb_typeof(x.value) = 'number';
      cur := greatest((acc ->> 'base')::numeric + earned - spent, 0);
      continue when cur = want;
      nbase := want - earned + spent;
      if jsonb_typeof(s -> 'wallet') is distinct from 'object' then s := jsonb_set(s, '{wallet}', '{}'::jsonb); end if;
      s := jsonb_set(s, array['wallet', wk], jsonb_set(acc, '{base}', to_jsonb(nbase)), true);
      s := jsonb_set(s, p, to_jsonb(want), true);
      e := jsonb_set(e, array['fields', k], jsonb_build_object('at', t, 'to', want, 'from', cur, 'base', nbase), true);
      continue;
    end if;
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

-- ==== analytics ====
-- (supabase/migrations/analytics.sql, copied verbatim; run either one. Keep the two identical.)
-- learn-git analytics: first-party, cookie-free learning events (.notes/analytics-supabase.md).
-- Run it in the Supabase SQL editor. Idempotent: re-running it replaces the policy and functions and
-- keeps the data. The same text is the "analytics" section at the end of supabase/schema.sql
-- (tests/analytics.test.mjs checks the two match).
--
-- Privacy: a row holds a random install id (made in the browser, never linked to an account), a
-- per-visit session id, the event name, a coarse device class and small numeric/id props. No user
-- id, email, IP, user agent or referrer. Browsers sending Do Not Track / GPC send nothing at all.
--
-- Security: the anon key may only INSERT rows that pass the policy's shape check, into the columns
-- granted below. Only admins (public.is_admin(), defined above in schema.sql) can read, and only
-- through the analytics_* functions or a select on the table. Nobody updates or deletes through the API.
--
-- Times: `at` is the browser's clock (so an event queued offline lands on the day it happened),
-- clamped by a trigger to [now() - 30 days, now()]. Days are UTC.

------------------------------------------------------------------------------ events
create table if not exists public.events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  received_at timestamptz not null default now(),
  install_id  uuid not null,
  session_id  uuid not null,
  name        text not null,
  device      text,
  props       jsonb not null default '{}'::jsonb
);

create index if not exists events_at_idx on public.events (at);
create index if not exists events_name_at_idx on public.events (name, at);
create index if not exists events_install_at_idx on public.events (install_id, at);

-- received_at is the server's clock; at can't be in the future or more than 30 days back.
create or replace function public.events_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.received_at := now();
  new.at := least(now(), greatest(coalesce(new.at, now()), now() - interval '30 days'));
  return new;
end;
$$;
drop trigger if exists events_stamp on public.events;
create trigger events_stamp
  before insert on public.events
  for each row execute function public.events_stamp();

alter table public.events enable row level security;

-- Insert-only for everyone with the anon key, if the row has the right shape: a known event name
-- (the list is EVENT_NAMES in js/analytics/events.js), a known device class, props a small JSON
-- object with at most 10 keys.
drop policy if exists "events: insert" on public.events;
create policy "events: insert" on public.events
  for insert to anon, authenticated
  with check (
    name in ('landing_view', 'app_open', 'onboarding_step', 'onboarding_done', 'lesson_start', 'lesson_done',
             'lesson_quit', 'exercise_answer', 'challenge_start', 'challenge_done', 'milestone', 'sign_in')
    and (device is null or device in ('phone', 'tablet', 'desktop'))
    and jsonb_typeof(props) = 'object'
    and octet_length(props::text) <= 1024
    and (select count(*) from jsonb_object_keys(props)) <= 10
  );

drop policy if exists "events: admins read" on public.events;
create policy "events: admins read" on public.events
  for select to authenticated
  using ((select public.is_admin()));

revoke all on public.events from anon, authenticated;
grant insert (at, install_id, session_id, name, device, props) on public.events to anon, authenticated;
grant select on public.events to authenticated;

------------------------------------------------------------------------------ dashboard functions
-- All: security definer, empty search_path, admins only, a UTC day range (inclusive) of at most a year.
create or replace function public.analytics_range(from_day date, to_day date)
returns tstzrange
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if from_day is null or to_day is null or to_day < from_day or to_day - from_day > 366 then
    raise exception 'pick a range of 1 to 367 days' using errcode = '22023';
  end if;
  return tstzrange((from_day::timestamp at time zone 'UTC'), ((to_day + 1)::timestamp at time zone 'UTC'), '[)');
end;
$$;

-- Totals for the range: events, installs, sessions, and installs per device class.
create or replace function public.analytics_summary(from_day date, to_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r tstzrange := public.analytics_range(from_day, to_day);
  res jsonb;
begin
  select jsonb_build_object(
           'events', count(*),
           'installs', count(distinct e.install_id),
           'sessions', count(distinct e.session_id),
           'pwa_opens', count(*) filter (where e.name = 'app_open' and e.props ->> 'pwa' = 'true'),
           'app_opens', count(*) filter (where e.name = 'app_open'),
           'devices', coalesce((select jsonb_object_agg(d.device, d.n) from (
               select coalesce(x.device, 'unknown') as device, count(distinct x.install_id) as n
               from public.events x where x.at <@ r group by 1) d), '{}'::jsonb))
    into res
    from public.events e where e.at <@ r;
  return res;
end;
$$;

-- One row per day: installs active that day, installs seen for the first time ever, sessions,
-- lessons finished.
create or replace function public.analytics_daily(from_day date, to_day date)
returns table (day date, installs integer, new_installs integer, sessions integer, lessons_done integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r tstzrange := public.analytics_range(from_day, to_day);
begin
  return query
    with days as (select generate_series(from_day, to_day, interval '1 day')::date as day),
    ev as (select (e.at at time zone 'UTC')::date as day, e.install_id, e.session_id, e.name
           from public.events e where e.at <@ r),
    firsts as (select (min(e.at) at time zone 'UTC')::date as day, e.install_id
               from public.events e
               where e.install_id in (select distinct install_id from ev)
               group by e.install_id)
    select d.day,
           (select count(distinct ev.install_id) from ev where ev.day = d.day)::integer,
           (select count(*) from firsts f where f.day = d.day)::integer,
           (select count(distinct ev.session_id) from ev where ev.day = d.day)::integer,
           (select count(*) from ev where ev.day = d.day and ev.name = 'lesson_done')::integer
    from days d order by d.day;
end;
$$;

-- The funnel for installs first seen in the range (new players: an install whose first app_open
-- already says onboarded=true was a player from before analytics existed, and is left out).
-- eligible = installs old enough for the step to be possible (day 1 / day 7 returns).
create or replace function public.analytics_funnel(from_day date, to_day date)
returns table (step integer, label text, installs integer, eligible integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r tstzrange := public.analytics_range(from_day, to_day);
  today date := (now() at time zone 'UTC')::date;
begin
  return query
    with firsts as (
      select e.install_id,
             (min(e.at) at time zone 'UTC')::date as first_day,
             (array_agg(e.props ->> 'onboarded' order by e.at) filter (where e.name = 'app_open'))[1] as first_onboarded
      from public.events e
      group by e.install_id
      having min(e.at) <@ r
    ),
    cohort as (select * from firsts where first_onboarded is distinct from 'true'),
    per as (
      select c.install_id, c.first_day,
        bool_or(e.name = 'landing_view') as landed,
        bool_or(e.name = 'app_open') as opened,
        bool_or(e.name = 'onboarding_step' and (e.props ->> 'step') in ('1', '2')) as lvl,
        bool_or(e.name = 'onboarding_step' and (e.props ->> 'step') = '2') as goal,
        bool_or(e.name = 'onboarding_done') as onboarded,
        bool_or(e.name = 'lesson_start') as started,
        bool_or(e.name = 'lesson_done') as finished,
        bool_or(e.name = 'app_open' and (e.at at time zone 'UTC')::date = c.first_day + 1) as d1,
        bool_or(e.name = 'app_open' and (e.at at time zone 'UTC')::date = c.first_day + 7) as d7
      from cohort c join public.events e on e.install_id = c.install_id
      group by c.install_id, c.first_day
    ),
    n as (select count(*)::integer as all_n,
                 count(*) filter (where first_day <= today - 1)::integer as d1_n,
                 count(*) filter (where first_day <= today - 7)::integer as d7_n from per)
    select s.step, s.label, s.installs, s.eligible from (
      select 1, 'Saw the landing page', (select count(*) filter (where landed) from per)::integer, n.all_n from n
      union all select 2, 'Opened the app', (select count(*) filter (where opened) from per)::integer, n.all_n from n
      union all select 3, 'Onboarding: picked a level', (select count(*) filter (where lvl) from per)::integer, n.all_n from n
      union all select 4, 'Onboarding: picked a goal', (select count(*) filter (where goal) from per)::integer, n.all_n from n
      union all select 5, 'Finished onboarding', (select count(*) filter (where onboarded) from per)::integer, n.all_n from n
      union all select 6, 'Started a lesson', (select count(*) filter (where started) from per)::integer, n.all_n from n
      union all select 7, 'Finished a lesson', (select count(*) filter (where finished) from per)::integer, n.all_n from n
      union all select 8, 'Came back the next day', (select count(*) filter (where d1 and first_day <= today - 1) from per)::integer, n.d1_n from n
      union all select 9, 'Came back on day 7', (select count(*) filter (where d7 and first_day <= today - 7) from per)::integer, n.d7_n from n
    ) as s(step, label, installs, eligible)
    order by s.step;
end;
$$;

-- Per path node (lessons, unit reviews, and 'mistakes' for the mistakes review): starts, finishes,
-- quits, completion (finished / started), median time to finish and average first-try accuracy.
create or replace function public.analytics_lessons(from_day date, to_day date)
returns table (node text, mode text, starts integer, done integer, quits integer, completion numeric, median_ms integer, accuracy numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r tstzrange := public.analytics_range(from_day, to_day);
begin
  return query
    select e.props ->> 'node',
           min(e.props ->> 'mode'),
           (count(*) filter (where e.name = 'lesson_start'))::integer,
           (count(*) filter (where e.name = 'lesson_done'))::integer,
           (count(*) filter (where e.name = 'lesson_quit'))::integer,
           round((count(*) filter (where e.name = 'lesson_done'))::numeric
                 / nullif(count(*) filter (where e.name = 'lesson_start'), 0), 3),
           (percentile_cont(0.5) within group (order by (e.props ->> 'ms')::numeric) filter (where e.name = 'lesson_done'))::integer,
           round(avg((e.props ->> 'accuracy')::numeric) filter (where e.name = 'lesson_done'), 3)
    from public.events e
    where e.at <@ r and e.name in ('lesson_start', 'lesson_done', 'lesson_quit') and e.props ? 'node'
    group by e.props ->> 'node'
    order by 4 desc, 1;
end;
$$;

-- The hardest exercises: lowest first-try correct rate, among exercises with at least min_n first
-- tries (the mistakes review is left out: those are already known to be hard for that player).
create or replace function public.analytics_exercises(from_day date, to_day date, min_n integer default 20)
returns table (ex text, type text, node text, tries integer, first_try_ok numeric, skips integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r tstzrange := public.analytics_range(from_day, to_day);
begin
  return query
    select e.props ->> 'ex',
           min(e.props ->> 'type'),
           min(e.props ->> 'node'),
           count(*)::integer,
           round(avg(case when e.props ->> 'ok' = 'true' then 1 else 0 end), 3),
           (count(*) filter (where e.props ->> 'skipped' = 'true'))::integer
    from public.events e
    where e.at <@ r and e.name = 'exercise_answer' and e.props ->> 'attempt' = '1'
      and e.props ? 'ex' and e.props ->> 'node' is distinct from 'mistakes'
    group by e.props ->> 'ex'
    having count(*) >= greatest(coalesce(min_n, 20), 1)
    order by 5, 4 desc
    limit 50;
end;
$$;

-- Where people quit: the node and the exercise on screen when they tapped Quit, with how far into
-- the lesson they were on average (reached / total).
create or replace function public.analytics_quits(from_day date, to_day date)
returns table (node text, ex text, quits integer, progress numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r tstzrange := public.analytics_range(from_day, to_day);
begin
  return query
    select e.props ->> 'node',
           e.props ->> 'ex',
           count(*)::integer,
           round(avg((e.props ->> 'reached')::numeric / nullif((e.props ->> 'total')::numeric, 0)), 3)
    from public.events e
    where e.at <@ r and e.name = 'lesson_quit'
    group by 1, 2
    order by 3 desc, 1
    limit 50;
end;
$$;

-- Challenges: starts, solves, average stars and moves.
create or replace function public.analytics_challenges(from_day date, to_day date)
returns table (level text, starts integer, done integer, stars numeric, moves numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r tstzrange := public.analytics_range(from_day, to_day);
begin
  return query
    select e.props ->> 'level',
           (count(*) filter (where e.name = 'challenge_start'))::integer,
           (count(*) filter (where e.name = 'challenge_done'))::integer,
           round(avg((e.props ->> 'stars')::numeric) filter (where e.name = 'challenge_done'), 2),
           round(avg((e.props ->> 'moves')::numeric) filter (where e.name = 'challenge_done'), 1)
    from public.events e
    where e.at <@ r and e.name in ('challenge_start', 'challenge_done') and e.props ? 'level'
    group by 1
    order by 2 desc, 1;
end;
$$;

-- Retention: raw events are deleted after keep_days (180 by default). Not callable through the API;
-- run it from pg_cron (see supabase/README.md, "Analytics"):
--   select cron.schedule('learn-git-events-cleanup', '17 3 * * *', $c$select public.analytics_cleanup(180)$c$);
create or replace function public.analytics_cleanup(keep_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.events where at < now() - make_interval(days => greatest(coalesce(keep_days, 180), 30));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.analytics_range(date, date) from public, anon;
revoke all on function public.analytics_summary(date, date) from public, anon;
revoke all on function public.analytics_daily(date, date) from public, anon;
revoke all on function public.analytics_funnel(date, date) from public, anon;
revoke all on function public.analytics_lessons(date, date) from public, anon;
revoke all on function public.analytics_exercises(date, date, integer) from public, anon;
revoke all on function public.analytics_quits(date, date) from public, anon;
revoke all on function public.analytics_challenges(date, date) from public, anon;
revoke all on function public.analytics_cleanup(integer) from public, anon, authenticated;
grant execute on function public.analytics_range(date, date) to authenticated;
grant execute on function public.analytics_summary(date, date) to authenticated;
grant execute on function public.analytics_daily(date, date) to authenticated;
grant execute on function public.analytics_funnel(date, date) to authenticated;
grant execute on function public.analytics_lessons(date, date) to authenticated;
grant execute on function public.analytics_exercises(date, date, integer) to authenticated;
grant execute on function public.analytics_quits(date, date) to authenticated;
grant execute on function public.analytics_challenges(date, date) to authenticated;
-- ==== /analytics ====

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
