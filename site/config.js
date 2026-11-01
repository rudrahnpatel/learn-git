// Landing-page configuration. Edit this file; nothing else needs to change.
//
// LAUNCHED: the waitlist form is gone from the page and site/waitlist.js is deleted. The WAITLIST_* / SUPABASE_*
// keys below (and the notes beside them) are UNUSED for now; they are kept so a waitlist can be re-added later.
//
// WAITLIST_ENDPOINT / WAITLIST_MODE decide where the email goes:
//
//   ''  (empty)            demo mode: the email is kept in this browser's localStorage only and the page
//                          says "you're on the list (demo mode)". Nothing leaves the device.
//
//   mode 'form'            Formspree-style: POST {email} as JSON to the URL with `Accept: application/json`.
//                          Works with Formspree, Getform, Basin, Web3Forms and a plain webhook.
//                          WAITLIST_ENDPOINT: 'https://formspree.io/f/xxxxxxxx'
//
//   mode 'supabase'        Supabase REST insert with the public anon key (see SQL below).
//                          WAITLIST_ENDPOINT: 'https://<project>.supabase.co/rest/v1/waitlist'
//                          SUPABASE_ANON_KEY: the project's anon (public) key.
//
// -- Supabase table (run once in the SQL editor). Insert-only: the anon key can add rows but never read them.
//
//   create table public.waitlist (
//     id         bigint generated always as identity primary key,
//     email      text not null,
//     source     text,
//     created_at timestamptz not null default now(),
//     constraint waitlist_email_len check (char_length(email) between 5 and 254),
//     constraint waitlist_email_fmt check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
//   );
//   create unique index waitlist_email_uniq on public.waitlist (lower(email));
//   alter table public.waitlist enable row level security;
//   create policy "anyone can join" on public.waitlist for insert to anon with check (true);
//   -- no select/update/delete policy: rows are only readable with the service key or in the dashboard.
//   grant insert on public.waitlist to anon;
//   -- a duplicate email returns HTTP 409; the page treats that as success ("already on the list").
//
// Keep the anon key public-by-design: the RLS policy above is the security boundary, not the key.
//
// BRAND: the name, copy and mascot the landing page renders (site/brand.js fills every [data-brand] element).
// To rebrand, edit BRAND, then run `node tools/brand.mjs` once: it regenerates the <head> title / description /
// Open Graph / Twitter tags (crawlers do not run JS), the PWA manifest names and the apple title from this block.
// MASCOT_SVG is the inside of a `viewBox="0 0 120 140"` SVG; it may use the CSS tokens (var(--yellow) etc).
window.LEARN_GIT_SITE = {
  BRAND: {
    NAME: 'learn-git',
    SHORT_NAME: 'learn-git',
    HERO_TITLE: 'Learn dev skills like a game.',
    HERO_LEDE: 'Starting with git. Lesson one is running on this page: make a commit and see what happens.',
    TITLE_SUFFIX: 'Free, in your browser',
    TAGLINE: 'Learn dev skills like a game, starting with git.',
    META_DESCRIPTION: 'Learn dev skills like a game, starting with git: three-minute lessons, a real git engine with a live commit graph, streaks, crates and cherries. Free, runs in your browser, nothing to install.',
    OG_DESCRIPTION: 'Three-minute lessons, a real git engine and a streak to keep alive. Free, in your browser, works offline.',
    FOOTER: 'learn-git · made with Twig',
    MASCOT_ALT: 'Twig, the yellow paper-cut mascot with a branching sprout',
    OG_IMAGE: '/brag-output/brag.jpg',   // absolute URL (https://yourdomain/...) is safest for scrapers once the domain is known
    // Reward-theme wording (the theme may be rebranded, e.g. to an orchard/garden world): the landing page only
    // mentions rewards through these keys, so a rebrand is an edit here, not in the HTML.
    REWARDS_LINE: 'Daily quests pay cherries, crates turn up on the path, and a stash covers the day you miss.',
    STREAK_SAVER: 'stash',        // the streak-freeze item, shown on the streak line in the history section
    MASCOT_SVG: `
    <g class="tw-sprout"><path d="M60 50 V20" stroke="var(--ink)" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M60 40 C60 30 72 30 80 22" stroke="var(--ink)" stroke-width="4" stroke-linecap="round" fill="none"/><polygon points="60,30 44,24 52,38" fill="var(--green)"/><circle cx="60" cy="16" r="7" fill="var(--iris)"/><circle cx="83" cy="19" r="7" fill="var(--red)"/></g>
    <path d="M36 138 a11 11 0 0 1 22 0z" fill="var(--twig-feet)"/><path d="M62 138 a11 11 0 0 1 22 0z" fill="var(--twig-feet)"/>
    <circle cx="9" cy="56" r="8.5" fill="var(--yellow)"/><circle cx="111" cy="56" r="8.5" fill="var(--yellow)"/>
    <circle cx="60" cy="88" r="42" fill="var(--yellow)"/><path d="M28 100 a32 30 0 0 0 64 0z" fill="var(--sunbeam)"/>
    <circle cx="35" cy="96" r="6.5" fill="var(--pink)"/><circle cx="85" cy="96" r="6.5" fill="var(--pink)"/>
    <path d="M40 82 q6 -8 12 0" stroke="#111118" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M68 82 q6 -8 12 0" stroke="#111118" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M50 94 h20 q0 14 -10 14 q-10 0 -10 -14z" fill="#111118"/><path d="M54 102 q6 -4 12 0 q-2 6 -6 6 q-4 0 -6 -6z" fill="var(--red)"/>`,
  },
  // Numbers the landing page quotes. Recount after content changes:
  //   node -e "import('./js/content/index.js').then(m=>{let e=0;for(const u of m.UNITS)for(const l of u.lessons)e+=l.exercises.length;console.log(e,m.UNITS.length)})"
  // Challenges: node -e "import('./js/levels.js').then(m=>console.log(m.LEVELS.length))"  (COMMANDS is a hand count)
  STATS: { EXERCISES: '477', LESSONS: '48', UNITS: '10', CHALLENGES: '42', COMMANDS: '37' },
  WAITLIST_ENDPOINT: '',
  WAITLIST_MODE: 'form',          // 'form' | 'supabase'
  SUPABASE_ANON_KEY: '',
  APP_URL: '/app',                // where "Play now" / "Start the course" point on Vercel; on a plain static server it falls back to "../"
};
