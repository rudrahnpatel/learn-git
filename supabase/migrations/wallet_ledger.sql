-- 2026-11-08: cherries and stashes become a ledger (js/wallet.js), so spending on one device can no
-- longer be undone by another device's copy (the old merge took max(gems) and max(streak.freezes)).
--
-- Only admin_update_progress changes: an edit to "gems" or "streak.freezes" now moves the wallet's base
-- so the balance is exactly the new value over the counters the cloud has, keeps the counters, writes
-- the plain number as a mirror, and stamps adminEdits.fields.<key> with { at, to, from, base }.
-- The same function body is in supabase/schema.sql (keep the two identical). Idempotent: safe to run
-- more than once, and running the whole schema.sql instead does the same thing. Nothing else in the
-- database changes (no table, policy or grant changes; the wallet lives inside progress.state).
--
-- Run: Supabase Dashboard -> SQL Editor -> New query -> paste this file -> Run.

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

revoke all on function public.admin_update_progress(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_progress(uuid, jsonb) to authenticated;
