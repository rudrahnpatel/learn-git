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
             'lesson_quit', 'exercise_answer', 'challenge_start', 'challenge_done', 'milestone', 'sign_in', 'course_switch')
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
