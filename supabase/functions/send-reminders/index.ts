// send-reminders: the daily practice reminder, as Web Push (VAPID).
// Called hourly by pg_cron (supabase/migrations/push_reminders_cron.sql). For every enabled
// push_subscriptions row whose local hour has come up, whose player hasn't practised today (in that
// row's time zone) and that wasn't sent one today, it sends one short, streak-aware notification.
// Dead subscriptions (404/410 from the push service) are deleted. See .notes/push-reminders.md.
//
// Auth: deploy with --no-verify-jwt; every request must carry either
//   x-reminder-secret: <REMINDER_SECRET>          (what the cron job sends)
//   Authorization: Bearer <service role key>      (for a manual run)
// A POST body of {"dryRun": true} lists who is due without sending or writing anything.
//
// Secrets (supabase secrets set ...): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (mailto:you@example.com or https://your.site), REMINDER_SECRET. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import webpush from 'npm:web-push@3.6.7';
import { preselect, pickDue } from '../_shared/reminders.js';

type Sub = {
  id: string; user_id: string; endpoint: string; keys: { p256dh: string; auth: string };
  time_zone: string; reminder_hour: number; enabled: boolean; last_sent: string | null;
};
type Due = { sub: Sub; day: string; message: { title: string; body: string; tag: string; url: string; streak: number } };

const env = (k: string) => Deno.env.get(k) ?? '';
const PAGE = 1000;          // rows per select page
const ID_CHUNK = 200;       // user ids per progress query
const PARALLEL = 10;        // pushes in flight at once
const TTL = 4 * 60 * 60;    // seconds the push service keeps an undelivered reminder (it's stale after that)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Constant-time string comparison (both sides hashed first, so lengths don't leak either).
async function safeEqual(a: string, b: string) {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const ua = new Uint8Array(x), ub = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}
async function authorised(req: Request) {
  const secret = req.headers.get('x-reminder-secret') ?? '';
  if (secret && await safeEqual(secret, env('REMINDER_SECRET'))) return true;
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return !!bearer && await safeEqual(bearer, env('SUPABASE_SERVICE_ROLE_KEY'));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!(await authorised(req))) return json(401, { error: 'unauthorised' });

  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'].filter((k) => !env(k));
  if (missing.length) return json(500, { error: `missing secrets: ${missing.join(', ')}` });

  let dryRun = false;
  try { dryRun = !!(await req.json())?.dryRun; } catch { /* empty body */ }

  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();

  // 1. Every enabled subscription, then the ones whose local hour is now and not sent today.
  const subs: Sub[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('push_subscriptions')
      .select('id, user_id, endpoint, keys, time_zone, reminder_hour, enabled, last_sent')
      .eq('enabled', true).order('id').range(from, from + PAGE - 1);
    if (error) return json(500, { error: `read subscriptions: ${error.message}` });
    subs.push(...(data as Sub[]));
    if (!data || data.length < PAGE) break;
  }
  const candidates = preselect(subs, now) as { sub: Sub; day: string }[];

  // 2. Only for those users: the bits of progress.state that say whether they played today.
  const states = new Map<string, unknown>();
  const ids = [...new Set(candidates.map((c) => c.sub.user_id))];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await sb.from('progress')
      .select('user_id, xpByDay:state->xpByDay, goalDays:state->goalDays, streak:state->streak, totalXp:state->totalXp')
      .in('user_id', ids.slice(i, i + ID_CHUNK));
    if (error) return json(500, { error: `read progress: ${error.message}` });
    for (const r of data ?? []) states.set(r.user_id, r);
  }
  const due = pickDue(candidates, states) as Due[];

  if (dryRun) {
    return json(200, { dryRun: true, at: now.toISOString(), enabled: subs.length, candidates: candidates.length,
      due: due.map((d) => ({ id: d.sub.id, user_id: d.sub.user_id, time_zone: d.sub.time_zone, day: d.day, title: d.message.title })) });
  }

  // 3. Send. Each row is claimed first (last_sent = today, only if it isn't already), so two
  //    overlapping runs can't both send it. A failed send that isn't "gone" gives the claim back.
  const result = { enabled: subs.length, candidates: candidates.length, due: due.length, sent: 0, pruned: 0, failed: 0, skipped: 0 };
  const sendOne = async ({ sub, day, message }: Due) => {
    const claim = sb.from('push_subscriptions').update({ last_sent: day }).eq('id', sub.id);
    const { data: claimed, error: claimErr } = await (sub.last_sent ? claim.eq('last_sent', sub.last_sent) : claim.is('last_sent', null)).select('id');
    if (claimErr || !claimed?.length) { result.skipped++; return; }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title: message.title, body: message.body, tag: message.tag, url: message.url }),
        { TTL, urgency: 'normal', topic: 'streak-reminder' },
      );
      result.sent++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        await sb.from('push_subscriptions').delete().eq('id', sub.id);
        result.pruned++;
      } else {
        result.failed++;
        console.warn('push failed', sub.id, code, (e as Error)?.message);
        await sb.from('push_subscriptions').update({ last_sent: sub.last_sent }).eq('id', sub.id).eq('last_sent', day);
      }
    }
  };
  const queue = [...due];
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let d = queue.shift(); d; d = queue.shift()) await sendOne(d);
  }));

  console.log('send-reminders', JSON.stringify(result));
  return json(200, result);
});
