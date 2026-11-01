// Pre-renders the 3D reward chest (scene.js) to the shipped images in icons/chest/.
//   cd tools/chest3d && npm install && npm run render
// Needs a Chromium (CHROMIUM=/path/to/chromium to override); WebGL runs on SwiftShader, so no GPU is needed.
// Options: --frames=14  --out=<dir> (default ../../icons/chest)  --png (also write PNG copies, for checking)
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const FRAMES = +arg('frames', 14);
const OUT = resolve(here, arg('out', '../../icons/chest'));
const PNG = process.argv.includes('--png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. serve this folder (scene.html imports three from ./node_modules)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer((req, res) => {
  const p = join(here, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(here)) { res.writeHead(403).end(); return; }
  try { const b = readFileSync(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }).end(b); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/scene.html`;

// 2. headless Chromium with its own profile dir, so only this process is ours to kill
const profile = mkdtempSync(join(tmpdir(), 'chest3d-'));
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(process.env.CHROMIUM || 'chromium', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let page;
for (let i = 0; i < 60 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!page) await sleep(200);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') console.error('page error:', m.params.exceptionDetails.exception?.description);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (m.error || m.result.exceptionDetails) throw new Error(JSON.stringify(m.error || m.result.exceptionDetails));
  return m.result.result.value;
};
// kill our Chromium (and only ours), then remove its profile once it has really exited
const exited = new Promise((r) => proc.once('exit', r));
const cleanup = async () => {
  try { ws.close(); } catch {}
  proc.kill('SIGKILL'); server.close();
  await Promise.race([exited, sleep(3000)]);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.stdout.on('error', () => {}); // a closed pipe (| head) must not skip the cleanup

try {
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  for (let i = 0; i < 100 && !(await evaluate('!!window.chestReady').catch(() => false)); i++) await sleep(100);
  mkdirSync(OUT, { recursive: true });
  const save = (name, dataUrl) => {
    const f = join(OUT, name);
    writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`${name.padEnd(24)} ${(statSync(f).size / 1024).toFixed(1)} KB`);
  };
  const angles = await evaluate(`chest.angles(${FRAMES})`);
  const OPEN = angles[angles.length - 1];
  save('chest-closed.webp', await evaluate(`chest.still(0, 512, 'image/webp', 0.88)`));
  save('chest-open.webp', await evaluate(`chest.still(${OPEN}, 512, 'image/webp', 0.88)`));
  save('chest-open-strip.webp', await evaluate(`chest.strip(${FRAMES}, 256, 'image/webp', 0.8)`));
  if (PNG) {
    save('chest-closed.png', await evaluate(`chest.still(0, 512, 'image/png')`));
    save('chest-open.png', await evaluate(`chest.still(${OPEN}, 512, 'image/png')`));
    save('chest-open-strip.png', await evaluate(`chest.strip(${FRAMES}, 256, 'image/png')`));
  }
  console.log(`frames: ${FRAMES}, lid angles: ${angles.join(', ')}`);
} finally { await cleanup(); }
