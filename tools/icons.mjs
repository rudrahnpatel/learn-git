// Renders icons/*.png from an inline SVG of Twig with headless Chromium.
//   node tools/icons.mjs
// Re-run only if the mascot or brand colours change; the PNGs are committed.
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const IRIS = '#2727e6';

// Twig (copied from js/ui/twig.js, idle mood) with concrete colours: a white stem so it reads on iris.
const twig = `
  <path d="M60 50 V20" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M60 40 C60 30 72 30 80 22" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/>
  <polygon points="60,30 44,24 52,38" fill="#16ab59"/>
  <circle cx="60" cy="16" r="7" fill="#91d8ec"/><circle cx="83" cy="19" r="7" fill="#ff4141"/>
  <path d="M36 138 a11 11 0 0 1 22 0z" fill="#111118"/><path d="M62 138 a11 11 0 0 1 22 0z" fill="#111118"/>
  <circle cx="20" cy="98" r="10" fill="#ffda00"/><circle cx="100" cy="98" r="10" fill="#ffda00"/>
  <circle cx="60" cy="88" r="42" fill="#ffda00"/>
  <path d="M28 100 a32 30 0 0 0 64 0z" fill="#ffe54d"/>
  <circle cx="35" cy="96" r="6.5" fill="#ffbac4"/><circle cx="85" cy="96" r="6.5" fill="#ffbac4"/>
  <ellipse cx="46" cy="80" rx="5.5" ry="7.5" fill="#111118"/><ellipse cx="74" cy="80" rx="5.5" ry="7.5" fill="#111118"/>
  <circle cx="47.5" cy="77" r="2" fill="#fff"/><circle cx="75.5" cy="77" r="2" fill="#fff"/>
  <path d="M52 96 q8 7 16 0" stroke="#111118" stroke-width="4" fill="none" stroke-linecap="round"/>`;

// scale = twig height as a share of the canvas; shapes = paper-cut decoration behind it.
function svg(size, scale, shapes) {
  const h = size * scale, w = h * 120 / 140;
  const x = (size - w) / 2, y = (size - h) / 2 + size * 0.02;
  const s = size / 512;
  const deco = shapes ? `
    <polygon points="${-20 * s},${360 * s} ${150 * s},${560 * s} ${-60 * s},${560 * s}" fill="#ff4141" transform="rotate(-8 0 ${460 * s})"/>
    <circle cx="${470 * s}" cy="${70 * s}" r="${110 * s}" fill="#91d8ec"/>
    <polygon points="${420 * s},${560 * s} ${560 * s},${380 * s} ${560 * s},${560 * s}" fill="#ffbac4"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${IRIS}"/>${deco}
  <g transform="translate(${x} ${y}) scale(${h / 140})">${twig}</g></svg>`;
}

const out = join(root, 'icons');
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'lg-icons-'));
const jobs = [
  ['icon-192.png', 192, 0.74, true],
  ['icon-512.png', 512, 0.74, true],
  ['icon-maskable-512.png', 512, 0.6, false], // full-bleed, Twig inside the 80% safe zone
  ['apple-touch-icon.png', 180, 0.74, false],  // iOS rounds it itself, so no transparency or rounding here
];
for (const [name, size, scale, shapes] of jobs) {
  const html = join(tmp, name + '.html');
  writeFileSync(html, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:${IRIS}}svg{display:block}</style>${svg(size, scale, shapes)}`);
  execFileSync(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--window-size=${size},${size}`,
    '--force-device-scale-factor=1', `--screenshot=${join(out, name)}`, 'file://' + html], { stdio: 'ignore' });
  console.log('wrote icons/' + name);
}
// A vector favicon too (small, crisp, no raster needed).
writeFileSync(join(out, 'icon.svg'), svg(512, 0.74, true));
