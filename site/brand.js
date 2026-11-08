// Brand fill and the "Play now" links. (The waitlist form was removed at launch; the WAITLIST_* keys in config.js are unused.)
const cfg = window.LEARN_GIT_SITE || {};

// Brand: render name, copy and mascot from config.js so a rename is a one-file change.
const brand = cfg.BRAND || {};
document.querySelectorAll('[data-brand]').forEach((el) => { el.textContent = brand[el.dataset.brand] ?? ''; });
document.querySelectorAll('[data-brand-attr]').forEach((el) => { const [a, k] = el.dataset.brandAttr.split(':'); if (brand[k]) el.setAttribute(a, brand[k]); });
if (brand.MASCOT_SVG) document.getElementById('mascot').innerHTML = brand.MASCOT_SVG;
if (brand.NAME && brand.TAGLINE) document.title = `${brand.NAME}: ${brand.TAGLINE} ${brand.TITLE_SUFFIX || ''}`.trim();

// "Play now" / "Start the course": /app on Vercel, the app root on a plain static server (where the page lives at /site/).
const app = document.querySelectorAll('a[data-app]');
const url = location.pathname.includes('/site/') ? '../' : (cfg.APP_URL || '/app');
app.forEach((a) => { a.href = url; });

// An installed PWA launches at start_url "./" (this page on Vercel): send it straight into the game.
let leaving = false;
try { if (matchMedia('(display-mode: standalone)').matches) { leaving = true; location.replace(url); } } catch { /* ignore */ }

// First-party, cookie-free analytics (js/analytics/track.js; off with Do Not Track / GPC): one landing_view.
if (!leaving) import('../js/analytics/track.js').then((m) => m.track('landing_view')).catch(() => {});
// The reel's play/pause lives in page.js (it plays only while on screen).
