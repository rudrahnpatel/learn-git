// The reward chest, built procedurally in three.js and rendered with flat toon shading so it matches
// the app's paper-cut look. Only used at build time (render.mjs pre-renders it to webp); never shipped.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The app's --crate-* tokens (light theme, css/style.css), plus gold for the latch and coins.
const C = {
  top: '#ffd23f', front: '#ffb21e', side: '#e8890c',
  band: '#8a3a12', bandSide: '#6b2a0b', inside: '#5a240a', ink: '#111118',
  gold: '#ffd23f', coin: '#ffe54d', coinRim: '#e0a000', heap: '#ffcc1a',
};

const RS = 1024; // render size; downsampled 2x/4x for the shipped files (cheap supersampling)
const canvas = document.createElement('canvas');
canvas.width = canvas.height = RS;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
renderer.setPixelRatio(1);
renderer.setSize(RS, RS, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// 3-step toon ramp: shade, mid, lit. Nearest filtering keeps the bands crisp (paper-cut tones, no gradients).
// 8 texels so the thresholds land per face: lid top lit, front mid, the side in shade.
const RAMP = [150, 150, 150, 150, 205, 205, 205, 255];
const ramp = new THREE.DataTexture(new Uint8Array(RAMP.flatMap((v) => [v, v, v, 255])), RAMP.length, 1, THREE.RGBAFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;
const toon = (hex) => new THREE.MeshToonMaterial({ color: hex, gradientMap: ramp });
const flat = (hex, opts = {}) => new THREE.MeshBasicMaterial({ color: hex, ...opts });

const M = {
  wood: toon(C.front), band: toon(C.band), gold: toon(C.gold), coin: toon(C.coin), coinRim: toon(C.coinRim), heap: toon(C.heap),
  inside: flat(C.inside), lidUnder: flat(C.inside), key: flat(C.ink),
  shadow: flat(C.ink, { transparent: true, opacity: 0.14, depthWrite: false }),
};

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xfff3d0, 2.9);
sun.position.set(0.8, 3, 1.6); // above, front, a little right: lit lid, mid front, shaded left side
scene.add(sun);

// ---------------------------------------------------------------- the model
const W = 1.6, D = 1.0, H = 0.82; // body width (x), depth (z), height (y)
const R = D / 2;                    // barrel lid radius
const LIP = 0.1;                    // straight part of the lid below the arc
const BW = 0.13, BT = 0.035;        // band width, band thickness (how far bands stand proud)

const chest = new THREE.Group();
scene.add(chest);

const box = (w, h, d, mat, x, y, z, r = 0.02) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.position.set(x, y, z);
  return m;
};

// body
chest.add(box(W, H, D, M.wood, 0, H / 2, 0, 0.06));
// the hollow: a dark inset on the top face (the coins heap up out of it)
const hole = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, D - 0.16), M.inside);
hole.rotation.x = -Math.PI / 2; hole.position.y = H + 0.006;
chest.add(hole);
// bands: corner posts, two vertical straps, a bottom rim and a top rim
for (const sx of [-1, 1]) for (const sz of [-1, 1]) chest.add(box(BW, H + 0.01, BW, M.band, sx * (W / 2 - BW / 2 + BT), H / 2, sz * (D / 2 - BW / 2 + BT), 0.02));
for (const x of [-0.42, 0.42]) {
  chest.add(box(BW, H, BT * 2, M.band, x, H / 2, D / 2));
  chest.add(box(BW, H, BT * 2, M.band, x, H / 2, -D / 2));
}
chest.add(box(W + BT * 2, 0.1, D + BT * 2, M.band, 0, 0.05, 0, 0.02));
chest.add(box(W + BT * 2, 0.07, D + BT * 2, M.band, 0, H - 0.04, 0, 0.015));
// the lock plate with its keyhole, on the front, just under the lid
const lock = new THREE.Group();
lock.add(box(0.3, 0.32, 0.06, M.gold, 0, 0, 0, 0.04));
const kh = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), M.key); kh.position.set(0, 0.03, 0.031); lock.add(kh);
const ks = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.09), M.key); ks.position.set(0, -0.03, 0.031); lock.add(ks);
lock.position.set(0, H - 0.2, D / 2 + 0.03);
chest.add(lock);

// the treasure: a mound of gold plus a few loose coins on top
const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.heap);
mound.scale.set(W / 2 - 0.12, 0.3, D / 2 - 0.1); mound.position.y = H - 0.02;
chest.add(mound);
const coinGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.035, 28);
const coins = [ // x, z, tilt x, tilt z (y follows the mound)
  [-0.42, 0.1, 0.5, 0.3], [-0.18, -0.12, -0.3, 0.2], [0.05, 0.18, 0.7, 0.1], [0.3, -0.05, 0.2, -0.6], [0.5, 0.14, 0.4, -0.5],
  [-0.05, -0.2, -0.2, -0.3], [0.2, 0.25, 0.9, 0.3], [-0.3, 0.26, 0.8, -0.2], [0.55, -0.18, -0.4, 0.4], [-0.55, -0.12, 0.1, 0.6],
];
for (const [x, z, rx, rz] of coins) {
  const a = mound.scale, k = 1 - (x / a.x) ** 2 - (z / a.z) ** 2;
  const c = new THREE.Mesh(coinGeo, [M.coinRim, M.coin, M.coin]); // side, top, bottom
  c.position.set(x, mound.position.y + a.y * Math.sqrt(Math.max(0, k)) + 0.01, z); c.rotation.set(rx, 0, rz); chest.add(c);
}

// lid: a half-cylinder barrel on a short straight lip, hinged on the body's back top edge
const hinge = new THREE.Group();
hinge.position.set(0, H, -D / 2);
chest.add(hinge);
const lid = new THREE.Group();
lid.position.set(0, 0, D / 2); // lid centre, relative to the hinge
hinge.add(lid);

function barrel(radius, lip, width, bevel) {
  const s = new THREE.Shape();
  s.moveTo(-radius, 0); s.lineTo(radius, 0); s.lineTo(radius, lip);
  s.absarc(0, lip, radius, 0, Math.PI, false);
  s.lineTo(-radius, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 40 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(Math.PI / 2); // extrude along x
  g.translate(0, bevel, 0); // the bevel grows the shape outward; keep its bottom on y=0
  return g;
}
lid.add(new THREE.Mesh(barrel(R, LIP, W, 0.04), M.wood));
// the lid's underside: dark, seen once it swings up
const under = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, D - 0.12), M.lidUnder);
under.rotation.x = Math.PI / 2; under.position.y = -0.012;
lid.add(under);
// arched straps and end caps on the lid, and a rim along its bottom edge
for (const x of [-0.42, 0.42]) { const b = new THREE.Mesh(barrel(R + BT, LIP, BW, 0), M.band); b.position.x = x; lid.add(b); }
for (const sx of [-1, 1]) { const b = new THREE.Mesh(barrel(R + BT, LIP, BW, 0.015), M.band); b.position.x = sx * (W / 2 - BW / 2 + BT); lid.add(b); }
lid.add(box(W + BT * 2, 0.07, D + BT * 2, M.band, 0, 0.028, 0, 0.015)); // bottom just below the barrel's, no z-fight
// the hasp hangs off the lid's front over the lock plate
const hasp = box(0.17, 0.2, 0.05, M.gold, 0, -0.02, R + 0.045, 0.03);
lid.add(hasp);

// a hard, flat contact shadow (the style has no soft shadows)
const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), M.shadow);
shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1.15, 0.78, 1); shadow.position.set(0.04, 0.001, 0.02);
scene.add(shadow);

// ---------------------------------------------------------------- camera: three-quarter, front-left, from above
const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
const AZ = -32 * Math.PI / 180, EL = 24 * Math.PI / 180, DIST = 7.6;
const target = new THREE.Vector3(0, 0.98, -0.12);
camera.position.set(target.x + DIST * Math.cos(EL) * Math.sin(AZ), target.y + DIST * Math.sin(EL), target.z + DIST * Math.cos(EL) * Math.cos(AZ));
camera.lookAt(target);

// Frame every pose the same way: project the model (closed, and at the strip's widest swing) and crop the view to a
// square around it with a lens shift (setViewOffset), so the chest fills the image without changing the perspective.
const PAD = 0.035;
function frame(maxDeg) {
  camera.clearViewOffset(); camera.updateMatrixWorld();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const v = new THREE.Vector3();
  for (const deg of [0, maxDeg]) {
    setLid(deg); scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(camera);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
    });
  }
  const side = Math.max(x1 - x0, y1 - y0) * (1 + PAD * 2) / 2 * RS; // NDC spans 2 -> px
  const cx = (x0 + x1) / 4 * RS + RS / 2, cy = RS / 2 - (y0 + y1) / 4 * RS;
  camera.setViewOffset(RS, RS, cx - side / 2, cy - side / 2, side, side);
}

function setLid(deg) {
  hinge.rotation.x = -deg * Math.PI / 180;
  hasp.visible = true;
}

// Render one pose; returns a canvas of `size` px (downsampled by halving for clean edges).
function pose(deg, size = 512) {
  setLid(deg);
  renderer.render(scene, camera);
  let src = canvas, s = RS;
  while (s > size) {
    const n = Math.max(size, s / 2);
    const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, n, n);
    src = c; s = n;
  }
  return src;
}

// lid angle per strip frame: ease out with a small overshoot, so the lid swings up and settles
export const OPEN = 105;
function stripAngles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const c1 = 2.0, c3 = c1 + 1;
    const e = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); // easeOutBack
    out.push(+(OPEN * e).toFixed(2));
  }
  return out;
}

frame(Math.max(...stripAngles(14)));

window.chest = {
  angles: stripAngles,
  still(deg, size = 512, type = 'image/webp', q = 0.9) { return pose(deg, size).toDataURL(type, q); },
  strip(n = 14, size = 256, type = 'image/webp', q = 0.9) {
    const out = document.createElement('canvas'); out.width = n * size; out.height = size;
    const x = out.getContext('2d');
    stripAngles(n).forEach((a, i) => x.drawImage(pose(a, size), i * size, 0));
    return out.toDataURL(type, q);
  },
};

// interactive preview
const view = document.getElementById('view');
if (view) {
  const vx = view.getContext('2d');
  const draw = () => { const d = +document.getElementById('lid').value; document.getElementById('deg').textContent = d + '°'; vx.clearRect(0, 0, 512, 512); vx.drawImage(pose(d, 512), 0, 0); };
  document.getElementById('lid').addEventListener('input', draw);
  document.getElementById('dark').addEventListener('change', (e) => document.body.classList.toggle('dark', e.target.checked));
  draw();
}
window.chestReady = true;
