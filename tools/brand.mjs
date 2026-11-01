// Applies site/config.js BRAND to the static files crawlers and the OS read (no JS runs for them):
//   node tools/brand.mjs
//   - site/index.html : <title>, description, Open Graph and Twitter tags (between the BRAND-META markers)
//   - manifest.webmanifest : name, short_name
//   - index.html (the app) : <title> and apple-mobile-web-app-title
// Then run `node tools/precache.mjs` (manifest and index.html are precached). Icons: see tools/icons.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'site/config.js'), 'utf8'), ctx);
const B = ctx.window.LEARN_GIT_SITE.BRAND;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const title = `${B.NAME}: ${B.TAGLINE} ${B.TITLE_SUFFIX || ''}`.trim();

const meta = `  <title>${esc(title)}</title>
  <meta name="description" content="${esc(B.META_DESCRIPTION)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(B.NAME)}">
  <meta property="og:title" content="${esc(B.NAME + ': ' + B.TAGLINE.replace(/\.$/, ''))}">
  <meta property="og:description" content="${esc(B.OG_DESCRIPTION)}">
  <meta property="og:image" content="${esc(B.OG_IMAGE)}">
  <meta property="og:image:width" content="1080">
  <meta property="og:image:height" content="1920">
  <meta property="og:image:alt" content="${esc(B.MASCOT_ALT)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(B.NAME + ': ' + B.TAGLINE.replace(/\.$/, ''))}">
  <meta name="twitter:description" content="${esc(B.OG_DESCRIPTION)}">
  <meta name="twitter:image" content="${esc(B.OG_IMAGE)}">`;
const edit = (file, fn) => { const p = join(root, file); const a = readFileSync(p, 'utf8'); const b = fn(a); if (a !== b) writeFileSync(p, b); console.log((a === b ? 'unchanged ' : 'updated   ') + file); };

edit('site/index.html', (s) => s.replace(/(<!-- BRAND-META:start[^\n]*-->\n)[\s\S]*?(<!-- BRAND-META:end -->)/, `$1${meta}\n$2`));
edit('manifest.webmanifest', (s) => { const m = JSON.parse(s); m.name = B.NAME; m.short_name = B.SHORT_NAME || B.NAME; return JSON.stringify(m, null, 2) + '\n'; });
edit('index.html', (s) => s.replace(/<title>[^<]*<\/title>/, `<title>${esc(B.NAME)}</title>`).replace(/(apple-mobile-web-app-title" content=")[^"]*/, `$1${esc(B.SHORT_NAME || B.NAME)}`));
