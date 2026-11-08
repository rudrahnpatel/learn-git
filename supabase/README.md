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

## How it is secured

- The browser only has the anon key. Row-level security on `progress` limits every signed-in user
  to their own row (read, insert, update; no delete).
- `delete_my_account()`, `is_admin()`, `admin_list_users()` and `admin_delete_user(uid)` are
  `security definer` functions with an empty `search_path`. The admin ones first check that the
  caller's JWT email is in `admins` and is confirmed on their account.
- `progress.rev` must go up by exactly one on every update (a trigger checks it). Two devices
  syncing at once can't overwrite each other: the loser re-reads, merges and tries again.
