// Supabase project for Google sign-in and progress sync (setup: supabase/README.md).
// Both values are public by design: the anon key only does what the row-level security in
// supabase/schema.sql allows. NEVER put the service-role key here (or anywhere in this repo).
// Leave them empty and every account feature hides itself: the app plays as a local-only guest.
export const SUPABASE_URL = 'https://dgalcekeajfmxwytooig.supabase.co';        // https://<project-ref>.supabase.co
export const SUPABASE_ANON_KEY = 'sb_publishable_pQLmL-cp4UBtbbCU5xEi9A_XoczDPy9';   // Project Settings -> API -> anon public key

// supabase-js v2, loaded from the CDN only when it is needed (an exact version, never a range).
export const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
// Where the auth session lives in localStorage (also how the app knows, without the SDK, that
// someone signed in on this browser).
export const AUTH_STORAGE_KEY = 'learn-git:auth';
