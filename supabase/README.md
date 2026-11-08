# Accounts setup (Supabase + Google sign-in)

Accounts are optional. Until `js/cloud/config.js` has a URL and an anon key, every account
feature hides itself and learn-git plays exactly as before, as a local-only guest.

What you get once it's set up: "Continue with Google" in the profile (and a one-time nudge after
the first lesson), progress merged across every device you sign in on, an account panel with
sign out and delete account, and `/admin` for the emails you list as admins.

You need: a Supabase project (the free tier is fine), a Google Cloud project, and the Vercel domain
the app is deployed on (`treeling.vercel.app`).

## 1. Create the Supabase project

1. https://supabase.com/dashboard → **New project**. Pick a region near your players and save the
   database password somewhere safe (the app never needs it).
2. When it's ready, open **Project Settings → API** and note:
   - **Project URL**: `https://<ref>.supabase.co` (`<ref>` is the project ref)
   - **anon public** key
   - Do **not** copy the `service_role` key anywhere. The app doesn't use it.

## 2. Create the Google OAuth client

1. https://console.cloud.google.com → pick or create a project.
2. **APIs & Services → OAuth consent screen**: External, app name "learn-git", your support email,
   scopes `email`, `profile`, `openid` (the defaults). While it's in "Testing", only the test users
   you add can sign in. **Publish** it when you're ready for everyone (these basic scopes need no review).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorised JavaScript origins: `https://treeling.vercel.app` and `http://localhost:8801`
   - Authorised redirect URIs: **`https://<ref>.supabase.co/auth/v1/callback`** (Supabase's callback,
     not the app's)
4. Copy the **Client ID** and **Client secret**.

## 3. Configure Supabase Auth

1. **Authentication → Sign In / Providers → Google**: enable it, paste the Client ID and Client
   secret, save.
2. Optional but recommended: switch off the **Email** provider, since the app only offers Google.
3. **Authentication → URL Configuration**:
   - **Site URL**: `https://treeling.vercel.app/app`
   - **Redirect URLs** (the allow-list), add:
     - `https://treeling.vercel.app/app`
     - `https://treeling.vercel.app/admin`
     - `http://localhost:8801/**` (local testing: the app sends people back to the page they signed
       in from, which locally is `/index.html` or `/admin/`)

## 4. Create the tables and functions

1. **SQL Editor → New query**, paste all of [`schema.sql`](schema.sql), **Run**. It's safe to run
   again after an update.
2. Make yourself an admin (same editor, your Google email):

   ```sql
   insert into public.admins (email) values ('you@gmail.com') on conflict do nothing;
   ```

   The `admins` table can't be read or written through the API at all, only from the dashboard.
   After that, admins can add or remove other admins from `/admin` (nobody can remove themselves).

**Updating:** when `schema.sql` changes (e.g. the 2026-11-07 admin editing functions), paste the whole
file into a new query and run it again. Tables and data are kept; functions, policies and grants are
replaced.

**2026-11-08, cherry/stash ledger:** run `supabase/migrations/wallet_ledger.sql` once (SQL Editor →
New query → paste → Run), or re-run the whole `schema.sql`, which contains the same function. It only
replaces `admin_update_progress`, so that editing Cherries or Stashes on `/admin` moves the new
`state.wallet` ledger instead of the plain number. No table, policy or config changes; existing rows
are migrated by the app itself the next time a device syncs. Run it before (or right after) deploying
the app: until it is run, an edit of Cherries or Stashes on a player whose devices already use the
ledger changes only the plain number and is ignored by the next sync (nothing breaks, the edit just
doesn't take; `/admin` shows a warning when that happens). Edits made before the app update still apply.

## 5. Fill in the app config

Edit `js/cloud/config.js`:

```js
export const SUPABASE_URL = 'https://<ref>.supabase.co';
export const SUPABASE_ANON_KEY = '<anon public key>';
```

Then run `node tools/precache.mjs` (config.js is a shipped file, so the service-worker version has
to change) and deploy.

## 6. Check it

1. Open `/app`, finish a lesson, and the "Save your progress" nudge appears. Or go to Profile →
   **Continue with Google**.
2. After Google you land back on `/app` with a "Signed in as …" toast. The profile shows your avatar,
   name, email and "Synced just now".
3. In Supabase, **Table Editor → progress** has one row with your state.
4. Sign in on a second browser or phone. Progress from both is merged (nothing is overwritten).
5. Open `/admin`. You see the user table. Someone not in `admins` sees "Not authorised".

Locally: `python3 -m http.server 8801` from the repo root, then open http://localhost:8801/index.html
(and http://localhost:8801/admin/).

## Analytics (first-party, no cookies)

The app and the landing page send a small set of learning events (lesson started / finished / quit,
first-try answers, onboarding steps, the funnel) to an `events` table in this same project, and
`/admin` → **Analytics** shows them. The event list and payload shapes live in
`js/learnlog/kinds.js`; the table, policy and dashboard functions in
[`migrations/analytics.sql`](migrations/analytics.sql) (also the `-- ==== analytics ====` section at
the end of `schema.sql`).

Privacy: a random install id (localStorage, never linked to a Google account), a per-visit session
id, a coarse device class (phone / tablet / desktop) and small id/number props. No user id, email,
IP, user agent or referrer is stored, no cookies are set. Browsers that send **Do Not Track** or
**Global Privacy Control** send nothing at all. Only the production host sends: localhost, LAN hosts
and plain http stay quiet (set `localStorage['learn-git:analytics'] = 'on'` to test locally, `'off'`
to opt a browser out).

### Owner steps (once, before deploying the analytics code)

1. **SQL Editor → New query**, paste [`migrations/analytics.sql`](migrations/analytics.sql) (or the
   whole `schema.sql` again), **Run**. Safe to re-run. Run it *before* deploying: until the table
   exists, every page's events get a 404 and are dropped (harmless, but lost).
2. Check it: **Table Editor → events** exists with RLS on. Open the deployed `/app`, play a step, and
   a few rows appear within ~15 s (or when you switch tabs). `/admin` → **Analytics** shows them.
3. **Retention (recommended): delete raw events after 180 days.** **Database → Extensions →** enable
   `pg_cron`, then in the SQL editor:

   ```sql
   select cron.schedule('learn-git-events-cleanup', '17 3 * * *',
                        $c$select public.analytics_cleanup(180)$c$);
   ```

   (`select cron.unschedule('learn-git-events-cleanup');` removes it. `analytics_cleanup` keeps at
   least 30 days and can't be called through the API.) Without pg_cron, run
   `select public.analytics_cleanup(180);` by hand now and then.
4. If the database ever stops accepting events from a new app version (a new event name), re-run
   the migration: the insert policy lists the allowed names.

Nothing else changes: no new keys, no provider settings, no Vercel config. The anon key can only
insert rows of the right shape; reading is admins only. Anyone holding the public anon key *can*
insert junk events of a valid shape (there is no server to rate-limit); the dashboard is for trends,
not accounting.

## How it is secured

- The browser only has the anon key. Row-level security on `progress` limits every signed-in user
  to their own row (read, insert, update; no delete).
- `delete_my_account()`, `is_admin()`, `admin_list_users()` and `admin_delete_user(uid)` are
  `security definer` functions with an empty `search_path`. The admin ones first check that the
  caller's JWT email is in `admins` and is confirmed on their account.
- `progress.rev` must go up by exactly one on every update (a trigger checks it). Two devices
  syncing at once can't overwrite each other: the loser re-reads, merges and tries again.

## Push reminders (optional)

Signed-in players get a **Daily reminder** switch and an hour picker in Profile → Account. When it's
on, that device gets one push notification at the chosen hour (its own time zone) on days they
haven't practised yet, even with the app closed. Guests keep the old local-only reminder pill.

How it fits together: the browser stores its Web Push subscription in `push_subscriptions` (RLS:
own rows only). Every hour `pg_cron` calls the `send-reminders` Edge Function, which reads the
subscriptions and the players' `progress` with the service role, picks the ones that are due and
sends through the browser's push service. Dead subscriptions (404/410) are deleted. Nothing below
has been run against the live project yet; do the steps in order.

Files: [`migrations/push_reminders.sql`](migrations/push_reminders.sql) (also at the end of
`schema.sql`), [`migrations/push_reminders_cron.sql`](migrations/push_reminders_cron.sql),
[`functions/send-reminders/index.ts`](functions/send-reminders/index.ts),
[`functions/_shared/reminders.js`](functions/_shared/reminders.js) (the due-user logic, unit-tested in
`tests/reminders.test.mjs`). The migration files are run by hand in the SQL editor; they don't use the
CLI's `<timestamp>_name.sql` naming, so `supabase db push` skips them on purpose.

### 1. Generate the VAPID keys (once, on your machine)

```sh
npx web-push@3.6.7 generate-vapid-keys        # or: deno run -A npm:web-push@3.6.7 generate-vapid-keys
```

It prints a **public key** (starts with `B`, ~87 characters) and a **private key** (~43 characters).
The public key goes in the app; the private key only ever goes into Supabase secrets (step 4).
Never commit the private key. If it leaks, generate a new pair: every device has to turn
reminders on again, because subscriptions are tied to the public key.

### 2. Create the table

SQL Editor → New query → paste [`migrations/push_reminders.sql`](migrations/push_reminders.sql) → Run
(or re-run the whole `schema.sql`, which now ends with the same section). Safe to run again.

### 3. Install and link the Supabase CLI

```sh
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref dgalcekeajfmxwytooig      # from the repo root
```

If the CLI complains that there's no `supabase/config.toml`, run `supabase init` once (it only adds
that file; the functions and SQL here are unaffected).

### 4. Set the function's secrets

```sh
openssl rand -hex 32            # the REMINDER_SECRET: keep it handy, step 6 stores it in Vault too
supabase secrets set \
  VAPID_PUBLIC_KEY='<public key from step 1>' \
  VAPID_PRIVATE_KEY='<private key from step 1>' \
  VAPID_SUBJECT='mailto:<your email>' \
  REMINDER_SECRET='<the hex string from openssl>'
supabase secrets list           # names only; values are shown as hashes
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.

### 5. Deploy the function

```sh
supabase functions deploy send-reminders --no-verify-jwt
```

`--no-verify-jwt` because the cron job authenticates with the `x-reminder-secret` header, not a user
JWT. The function refuses every request without that secret (or the service-role key as a Bearer
token), and only accepts POST. Try it without sending anything:

```sh
curl -s -X POST 'https://dgalcekeajfmxwytooig.supabase.co/functions/v1/send-reminders' \
  -H 'x-reminder-secret: <REMINDER_SECRET>' -H 'content-type: application/json' \
  -d '{"dryRun": true}'
# -> {"dryRun":true,"enabled":0,"candidates":0,"due":[]}  (lists who would get one this hour)
```

### 6. Schedule it (pg_cron + pg_net)

1. **Database → Extensions**: enable **pg_cron** and **pg_net** (the SQL in the next step also tries
   `create extension if not exists`, which works when you're the project owner).
2. SQL Editor, store the two values the job needs in Vault (once; nothing secret goes in a file):

   ```sql
   select vault.create_secret('https://dgalcekeajfmxwytooig.supabase.co', 'learn_git_project_url');
   select vault.create_secret('<REMINDER_SECRET from step 4>', 'learn_git_reminder_secret');
   ```

   To change one later: `select vault.update_secret((select id from vault.secrets where name = 'learn_git_reminder_secret'), '<new value>');`
3. SQL Editor → paste [`migrations/push_reminders_cron.sql`](migrations/push_reminders_cron.sql) → Run.
   It schedules `learn-git-send-reminders` at minutes 0 and 30 of every hour (UTC).

**Half-hour time zones:** the job runs every half hour so that reminders land on the hour in
half-hour zones too (India +5:30: the :30 UTC run is 19:00 local). A device is due when its local
hour equals its reminder hour, and the function sends at most once per device per local day, so the
second run in whole-hour zones finds it already sent.

Check it: `select * from cron.job_run_details order by start_time desc limit 5;` and
`select status_code, content from net._http_response order by created desc limit 5;`.
Stop it: `select cron.unschedule('learn-git-send-reminders');`.

### 7. Put the public key in the app

Edit `js/cloud/config.js`:

```js
export const VAPID_PUBLIC_KEY = '<public key from step 1>';
```

Then `node tools/precache.mjs` (config.js is a shipped file) and deploy. Until this is filled in, the
Daily reminder switch stays hidden and nothing else changes.

### 8. Check it

1. Open `/app` signed in → Profile → Account → **Daily reminder**. Turn it on and allow
   notifications. A row appears in **Table Editor → push_subscriptions** with your time zone.
2. Set the hour to the current hour, don't play today, and run the `curl` from step 5 without
   `dryRun` (or wait for the top of the hour). The notification appears; tapping it opens the app.
3. Run it again: nothing is sent (`last_sent` is today). Play a lesson tomorrow before the hour: nothing
   is sent that day.

Platform notes: Chrome, Edge, Firefox and Safari on macOS work in a normal tab. **iPhone/iPad only
deliver push to the installed app** (Share → Add to Home Screen, iOS/iPadOS 16.4 or later); the
switch explains that in Safari. If notifications are blocked for the site, the switch says how to
allow them. Signing out or deleting the account removes this device's subscription.

How it is secured: the browser can only read, add, change (keys, time zone, hour, on/off) and delete
its own account's rows; `last_sent` and the owner can't be changed from the browser, an unknown time
zone is refused, and an account can have at most 10 devices. Only the Edge Function (service role)
reads every row and the `progress` table, and the function only runs for the cron secret or the
service-role key. The VAPID private key lives only in the function's secrets.
