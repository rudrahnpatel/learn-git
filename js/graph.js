// Live SVG commit graph: time flows left to right, each lane is a row.
// Positions animate between renders (new commits grow out of their parent,
// labels slide when a branch moves, orphaned commits fade).
import { esc } from './dom.js';

const LANE_COLORS = 6;
const SIZES = {
  full: { DX: 74, R: 11, LH: 20, GAP: 40, PADX: 34, PADY: 14, FONT: 11 },
  mid: { DX: 52, R: 9, LH: 18, GAP: 26, PADX: 26, PADY: 10, FONT: 10 },
  mini: { DX: 30, R: 6, LH: 15, GAP: 12, PADX: 14, PADY: 8, FONT: 9 },
};

function labelWidth(text, font) { return Math.round(text.length * font * 0.62 + font * 1.3); }

export function layout(data, { mini = false, size = null, showGhosts = true } = {}) {
  const S = SIZES[size || (mini ? 'mini' : 'full')];
  const commits = data.commits.filter((c) => showGhosts || !c.ghost);
  const vis = new Set(commits.map((c) => c.id));
  const byId = Object.fromEntries(commits.map((c) => [c.id, { ...c, parents: c.parents.filter((p) => vis.has(p)) }]));
  const order = commits.map((c) => c.id); // ascending by creation counter

  // column = generation (longest path from a root)
  const col = {};
  for (const id of order) { const ps = byId[id].parents; col[id] = ps.length ? Math.max(...ps.map((p) => col[p])) + 1 : 0; }

  // labels per commit
  const labels = {};
  const add = (id, l) => { if (id && vis.has(id)) (labels[id] ||= []).push(l); };
  if (!data.head.branch && data.head.id) add(data.head.id, { key: 'HEAD', text: 'HEAD', kind: 'head' });
  const bnames = Object.keys(data.branches).sort((a, b) => (b === data.head.branch) - (a === data.head.branch));
  for (const b of bnames) add(data.branches[b], { key: 'b:' + b, text: b, kind: b === data.head.branch ? 'current' : 'branch' });
  for (const [r, id] of Object.entries(data.remotes)) add(id, { key: 'r:' + r, text: r, kind: 'remote' });
  for (const [t, id] of Object.entries(data.tags)) add(id, { key: 't:' + t, text: t, kind: 'tag' });
  if (data.bisect) {
    if (data.bisect.bad) add(data.bisect.bad, { key: 'bisect:bad', text: 'bad', kind: 'bad' });
    data.bisect.good.forEach((g, i) => add(g, { key: 'bisect:good' + i, text: 'good', kind: 'good' }));
  }
  if (mini) for (const k in labels) labels[k] = labels[k].filter((l) => l.kind !== 'remote' || labels[k].length < 3);

  // lanes: walk first-parent chains from tips in a stable priority order
  const tips = [];
  const main = ['main', 'master'].find((b) => b in data.branches);
  if (main) tips.push(data.branches[main]);
  for (const b of Object.keys(data.branches)) tips.push(data.branches[b]);
  for (const id of Object.values(data.remotes)) tips.push(id);
  for (const id of Object.values(data.tags)) tips.push(id);
  if (data.head.id) tips.push(data.head.id);
  const hasChild = new Set();
  for (const id of order) for (const p of byId[id].parents) hasChild.add(p);
  for (const id of [...order].reverse()) if (!hasChild.has(id)) tips.push(id);
  for (const id of [...order].reverse()) tips.push(id);

  const lane = {};
  const occupied = [];
  for (const tip of tips) {
    if (!tip || !vis.has(tip) || tip in lane) continue;
    const chain = [];
    let id = tip;
    while (id && !(id in lane)) { chain.push(id); id = byId[id].parents[0]; }
    const lo = col[chain[chain.length - 1]] - (id ? 0.5 : 0), hi = col[chain[0]] + 0.5;
    let L = 0;
    while ((occupied[L] || []).some(([a, b]) => a < hi && lo < b)) L++;
    (occupied[L] ||= []).push([lo, hi]);
    for (const c of chain) lane[c] = L;
  }
  const laneCount = occupied.length || 1;
  const xOf = (id) => S.PADX + col[id] * S.DX;
  // stack labels upward, bumping a label to a higher level when it would collide with a neighbour's
  const level = {};
  const maxLabels = new Array(laneCount).fill(0);
  const rights = Array.from({ length: laneCount }, () => []);
  for (const id of [...order].sort((a, b) => col[a] - col[b])) {
    const L = lane[id], x = xOf(id);
    let minLevel = 0;
    for (const l of labels[id] || []) {
      const w = l.kind === 'current' ? labelWidth('HEAD', S.FONT - 1) + labelWidth(l.text, S.FONT) : labelWidth(l.text, S.FONT);
      let k = minLevel;
      while (rights[L][k] !== undefined && rights[L][k] > x - w / 2 - 4) k++;
      rights[L][k] = x + w / 2;
      level[l.key] = k;
      minLevel = k + 1;
      maxLabels[L] = Math.max(maxLabels[L], k + 1);
    }
  }
  const laneY = [];
  let y = S.PADY;
  for (let L = 0; L < laneCount; L++) {
    y += maxLabels[L] * S.LH + (maxLabels[L] ? 6 : 0);
    laneY[L] = y + S.R;
    y += S.R * 2 + S.GAP;
  }
  const height = y - S.GAP + (mini ? 6 : size === 'mid' ? 22 : 30);
  const maxCol = order.length ? Math.max(...order.map((id) => col[id])) : 0;
  const width = S.PADX * 2 + maxCol * S.DX + (mini ? 10 : 60);

  const nodes = {};
  for (const id of order) {
    const c = byId[id];
    nodes[id] = { id, x: xOf(id), y: laneY[lane[id]], lane: lane[id], ghost: c.ghost, msg: c.msg, author: c.author, parents: c.parents, merge: c.parents.length > 1 };
  }
  const lab = {};
  for (const [id, ls] of Object.entries(labels)) {
    for (const l of ls) {
      const n = nodes[id];
      lab[l.key] = { ...l, x: n.x, y: n.y - S.R - 8 - level[l.key] * S.LH, commit: id };
    }
  }
  return { nodes, labels: lab, width, height, S, headId: data.head.id, mergeHead: data.mergeHead };
}

const ease = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

export class GraphView {
  // zoom: options for GraphZoom (pinch / ctrl+wheel / − + fit buttons), or null for a fixed-size graph
  constructor(container, { mini = false, size = null, animated = false, onCommitClick = null, zoom = null } = {}) {
    this.container = container;
    this.size = size || (mini ? 'mini' : 'full');
    this.mini = this.size !== 'full';
    this.animated = animated;
    this.onCommitClick = onCommitClick;
    this.disp = { nodes: {}, labels: {} };
    this.target = null;
    this.raf = 0;
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'graph-svg' + (mini ? ' mini' : ''));
    this.svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', 'Commit graph');
    container.append(this.svg);
    if (onCommitClick) this.svg.addEventListener('click', (e) => {
      const g = e.target.closest('[data-id]');
      if (g) onCommitClick(g.getAttribute('data-id'));
    });
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.zoom = zoom && this.size !== 'mini' ? new GraphZoom(this, zoom) : null;
  }
  // the final frame of a render is on screen: re-fit (unless the player zoomed by hand) and bring HEAD into view
  settled() { this.zoom?.refresh(); this.autoscroll(this.target); }

  render(data, { animate = true, showGhosts = true } = {}) {
    const target = layout(data, { mini: this.size === 'mini', size: this.size, showGhosts });
    const from = { nodes: { ...this.disp.nodes }, labels: { ...this.disp.labels } };
    this.target = target;
    cancelAnimationFrame(this.raf);
    if (!animate || (this.mini && !this.animated) || this.reduced || !Object.keys(from.nodes).length) {
      this.frame(from, target, 1);
      this.settled();
      return;
    }
    const t0 = performance.now(), dur = 480;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      this.frame(from, target, ease(t));
      if (t < 1) this.raf = requestAnimationFrame(step); else this.settled();
    };
    this.raf = requestAnimationFrame(step);
    this.autoscroll(target);
  }

  autoscroll(target) {
    const c = this.container, head = target?.nodes[target.headId];
    if (!head || this.size === 'mini') return;
    // HEAD's place inside the scroller, whatever the zoom (CSS zoom scales the svg's layout box) and centring
    const s = this.svg.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const w = +this.svg.getAttribute('width'), hgt = +this.svg.getAttribute('height');
    if (!w || !hgt || !s.width) return;
    const k = s.width / w, vb = this.svg.viewBox.baseVal;
    const x = s.left - cr.left + c.scrollLeft + (head.x - (vb?.x || 0)) * k;
    const y = s.top - cr.top + c.scrollTop + head.y * k;
    if (c.scrollWidth > c.clientWidth + 1 && (x + 90 * k > c.scrollLeft + c.clientWidth || x - 60 * k < c.scrollLeft)) c.scrollLeft = Math.max(0, x - c.clientWidth / 2);
    // a short pane (the phone split view) can be shorter than the graph: keep HEAD's row in view too
    if (c.scrollHeight > c.clientHeight + 1 && (y - 40 * k < c.scrollTop || y + 30 * k > c.scrollTop + c.clientHeight)) c.scrollTop = Math.max(0, y - c.clientHeight / 2);
  }

  frame(from, T, t) {
    const S = T.S;
    const pos = {};
    // nodes in target
    for (const n of Object.values(T.nodes)) {
      let f = from.nodes[n.id];
      if (!f) {
        const p = n.parents.map((id) => from.nodes[id]).find(Boolean);
        f = p ? { x: p.x, y: p.y, o: 0 } : { x: n.x, y: n.y, o: 0 };
      }
      pos[n.id] = { x: lerp(f.x, n.x, t), y: lerp(f.y, n.y, t), o: lerp(f.o ?? 1, 1, t) };
    }
    // nodes leaving
    const leaving = Object.entries(from.nodes).filter(([id]) => !T.nodes[id]).map(([id, f]) => ({ id, ...f, o: (f.o ?? 1) * (1 - t) }));
    const lpos = {};
    for (const l of Object.values(T.labels)) {
      let f = from.labels[l.key];
      if (!f) { const np = from.nodes[l.commit]; f = np ? { x: np.x, y: l.y - (T.nodes[l.commit].y - np.y), o: 0 } : { x: l.x, y: l.y, o: 0 }; }
      lpos[l.key] = { x: lerp(f.x, l.x, t), y: lerp(f.y, l.y, t), o: lerp(f.o ?? 1, 1, t) };
    }
    this.disp = { nodes: { ...pos }, labels: { ...lpos } };
    for (const n of leaving) if (n.o > 0.02) this.disp.nodes[n.id] = { x: n.x, y: n.y, o: n.o };

    // labels are centred on their commit, so the first one can stick out on the left
    let minX = 0;
    for (const l of Object.values(T.labels)) {
      const w = l.kind === 'current' ? labelWidth('HEAD', S.FONT - 1) + labelWidth(l.text, S.FONT) : labelWidth(l.text, S.FONT);
      minX = Math.min(minX, lpos[l.key].x - w / 2 - 4);
    }
    minX = Math.floor(minX);
    const W = Math.max(T.width, ...Object.values(pos).map((p) => p.x + (this.mini ? 30 : 60))) - minX;
    const H = Math.max(T.height, ...Object.values(pos).map((p) => p.y + 30));
    this.svg.setAttribute('width', W);
    this.svg.setAttribute('height', H);
    this.svg.setAttribute('viewBox', `${minX} 0 ${W} ${H}`);

    const parts = [];
    // edges
    for (const n of Object.values(T.nodes)) {
      const c = pos[n.id];
      n.parents.forEach((pid, i) => {
        const p = pos[pid];
        if (!p) return;
        const lanePar = T.nodes[pid].lane, laneMe = n.lane;
        const color = `var(--lane-${(i === 0 ? laneMe : lanePar) % LANE_COLORS})`;
        let d;
        if (Math.abs(p.y - c.y) < 0.5) d = `M${p.x},${p.y} L${c.x},${c.y}`;
        else if (i === 0) { const k = Math.min(S.DX, c.x - p.x); d = `M${p.x},${p.y} C${p.x + k * 0.55},${p.y} ${p.x + k * 0.45},${c.y} ${p.x + k},${c.y} L${c.x},${c.y}`; }
        else { const k = Math.min(S.DX, c.x - p.x); d = `M${p.x},${p.y} L${c.x - k},${p.y} C${c.x - k * 0.45},${p.y} ${c.x - k * 0.55},${c.y} ${c.x},${c.y}`; }
        const ghost = n.ghost || T.nodes[pid].ghost;
        parts.push(`<path d="${d}" class="edge${ghost ? ' ghost' : ''}" stroke="${color}" opacity="${Math.min(c.o, p.o)}"/>`);
      });
    }
    // leaving nodes
    for (const n of leaving) if (n.o > 0.02) parts.push(`<circle cx="${n.x}" cy="${n.y}" r="${S.R}" class="node ghost" opacity="${n.o}"/>`);
    // nodes
    for (const n of Object.values(T.nodes)) {
      const c = pos[n.id];
      const color = `var(--lane-${n.lane % LANE_COLORS})`;
      const isHead = n.id === T.headId;
      const cls = 'node' + (n.ghost ? ' ghost' : '') + (isHead ? ' head' : '') + (n.merge ? ' merge' : '');
      let g = `<g class="commit" data-id="${n.id}" opacity="${c.o}" tabindex="-1"><title>${esc(n.id)}  ${esc(n.msg)}  (${esc(n.author)})${n.ghost ? '  · orphaned: only the reflog remembers it' : ''}</title>`;
      if (isHead) g += `<circle cx="${c.x}" cy="${c.y}" r="${S.R + (this.mini ? 3 : 5)}" class="head-ring" stroke="${color}"/>`;
      g += `<circle cx="${c.x}" cy="${c.y}" r="${S.R}" class="${cls}" stroke="${color}" style="--c:${color}"/>`;
      if (n.id === T.mergeHead) g += `<circle cx="${c.x}" cy="${c.y}" r="${S.R + 4}" class="merge-ring"/>`;
      if (this.size === 'mid') {
        const m = n.msg.length > 9 ? n.msg.slice(0, 8) + '…' : n.msg;
        g += `<text x="${c.x}" y="${c.y + S.R + 14}" class="cmsg">${esc(m)}</text>`;
      }
      if (!this.mini) {
        g += `<text x="${c.x}" y="${c.y + S.R + 14}" class="cid">${esc(n.id)}</text>`;
        const m = n.msg.length > 11 ? n.msg.slice(0, 10) + '…' : n.msg;
        g += `<text x="${c.x}" y="${c.y + S.R + 26}" class="cmsg">${esc(m)}</text>`;
      }
      parts.push(g + '</g>');
    }
    // labels
    for (const l of Object.values(T.labels)) {
      const p = lpos[l.key];
      const F = S.FONT;
      const hgt = F + 7;
      if (l.kind === 'current') {
        const w1 = labelWidth('HEAD', F - 1), w2 = labelWidth(l.text, F);
        const x0 = p.x - (w1 + w2) / 2;
        parts.push(`<g class="label current" opacity="${p.o}"><rect x="${x0}" y="${p.y - hgt + 3}" width="${w1 + w2}" height="${hgt}" rx="${hgt / 2}" class="lbl-bg"/>` +
          `<rect x="${x0}" y="${p.y - hgt + 3}" width="${w1}" height="${hgt}" rx="${hgt / 2}" class="lbl-head"/>` +
          `<text x="${x0 + w1 / 2}" y="${p.y - 1}" class="lbl-head-t" font-size="${F - 1}">HEAD</text>` +
          `<text x="${x0 + w1 + w2 / 2}" y="${p.y - 1}" class="lbl-t" font-size="${F}">${esc(l.text)}</text></g>`);
      } else {
        const w = labelWidth(l.text, F);
        parts.push(`<g class="label ${l.kind}" opacity="${p.o}"><rect x="${p.x - w / 2}" y="${p.y - hgt + 3}" width="${w}" height="${hgt}" rx="${hgt / 2}" class="lbl-bg"/>` +
          `<text x="${p.x}" y="${p.y - 1}" class="lbl-t" font-size="${F}">${esc(l.text)}</text></g>`);
      }
    }
    if (!Object.keys(T.nodes).length) parts.push(`<text x="20" y="40" class="cmsg" text-anchor="start">No commits yet</text>`);
    this.svg.innerHTML = parts.join('');
  }
}

// Zoom for a GraphView's scroller, within modest limits (0.6x to 1.8x of the graph's natural size). By default the
// graph is fitted to its pane (never above the stylesheet's own zoom for that screen, never below the minimum) and
// re-fitted whenever the pane or the graph changes; once the player zooms by hand (pinch, ctrl/cmd+wheel or trackpad
// pinch, the − / + buttons) that zoom is kept for the rest of the session on that screen (`key`) until they press
// "fit" or double-tap. One finger still pans (native overflow scrolling; touch-action leaves pinching to us).
// opts: { key, host (element that gets the − + fit buttons), box() -> {w, h} (room to fit into; default: the
// scroller's client box), fitHeight (default true), keepFocus(btn) }
export const ZOOM_MIN = 0.6, ZOOM_MAX = 1.8;
const zoomMemo = new Map(); // key -> { z, manual } for this session
export class GraphZoom {
  constructor(view, { key = null, host = null, box = null, fitHeight = true, keepFocus = (b) => b } = {}) {
    this.view = view; this.c = view.container; this.svg = view.svg;
    this.key = key; this.box = box; this.fitHeight = fitHeight;
    const memo = key && zoomMemo.get(key);
    this.manual = !!memo?.manual; this.z = memo?.z || 0;
    this.c.classList.add('zoomable');
    if (host) {
      const btn = (cls, label, text, fn) => keepFocus(Object.assign(document.createElement('button'), { type: 'button', className: 'gz-btn ' + cls, textContent: text, title: label, onclick: fn }));
      this.out = btn('gz-out', 'Zoom out', '\u2212', () => this.step(1 / 1.25));
      this.in = btn('gz-in', 'Zoom in', '+', () => this.step(1.25));
      this.fitBtn = btn('gz-fit', 'Fit the graph to the pane', 'fit', () => this.reset());
      for (const b of [this.out, this.in, this.fitBtn]) b.setAttribute('aria-label', b.title);
      this.bar = document.createElement('div');
      this.bar.className = 'graph-zoom';
      this.bar.setAttribute('role', 'group'); this.bar.setAttribute('aria-label', 'Graph zoom');
      this.bar.append(this.out, this.in, this.fitBtn);
      host.append(this.bar);
    }
    // ctrl/cmd + wheel, and trackpad pinch (which arrives as ctrl + wheel), zoom around the cursor
    this.c.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.set(this.cur() * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)), true, e.clientX, e.clientY);
    }, { passive: false });
    // two fingers pinch around their midpoint; a double tap (or double click off a commit) fits again
    let pinch = null, lastTap = 0, moved = false;
    const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
    this.c.addEventListener('touchstart', (e) => {
      moved = e.touches.length > 1;
      if (e.touches.length === 2) pinch = { d: dist(e.touches), z: this.cur() };
    }, { passive: true });
    this.c.addEventListener('touchmove', (e) => {
      moved = true;
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const [x, y] = mid(e.touches);
      this.set(pinch.z * dist(e.touches) / pinch.d, true, x, y);
    }, { passive: false });
    this.c.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length || moved || e.changedTouches.length !== 1) { if (!e.touches.length) lastTap = 0; return; }
      const now = Date.now();
      if (now - lastTap < 320) { lastTap = 0; this.reset(); } else lastTap = now;
    });
    this.c.addEventListener('dblclick', (e) => { if (!e.target.closest?.('[data-id]')) this.reset(); });
    // the pane changed size (keyboard, view switch, window): fit again unless zoomed by hand
    let last = '';
    this.ro = new ResizeObserver(() => {
      const b = this.room(), sig = Math.round(b.w / 3) + 'x' + Math.round(b.h / 3); // ignore 1-2px wobble
      if (sig === last) return;
      last = sig;
      if (!this.manual) this.fit();
      view.autoscroll(view.target);
    });
    this.ro.observe(this.c);
    if (this.manual && this.z) this.apply(this.z);
  }
  // the stylesheet's zoom for this screen (1.15 for the desktop challenge, 1.3 for the wide type exercise, else 1)
  base() { const keep = this.svg.style.zoom; this.svg.style.zoom = ''; const z = parseFloat(getComputedStyle(this.svg).zoom) || 1; this.svg.style.zoom = keep; return z; }
  cur() { return this.z || this.base(); }
  room() {
    if (this.box) return this.box();
    const cs = getComputedStyle(this.c), mh = parseFloat(cs.maxHeight);
    return { w: this.c.clientWidth, h: mh > 0 && this.c.clientHeight >= mh - 2 ? mh : this.c.clientHeight };
  }
  fitZoom() {
    const w = +this.svg.getAttribute('width'), h = +this.svg.getAttribute('height'), b = this.room();
    if (!w || !h || !b.w) return this.base();
    let z = Math.min(this.base(), (b.w - 8) / w, this.fitHeight && b.h > 0 ? (b.h - 4) / h : Infinity);
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  }
  fit() { this.apply(this.fitZoom()); }
  refresh() { if (this.manual && this.z) this.apply(this.z); else this.fit(); }
  reset() { this.manual = false; this.fit(); this.save(); this.view.autoscroll(this.view.target); }
  step(f) { const r = this.c.getBoundingClientRect(); this.set(this.cur() * f, true, r.left + r.width / 2, r.top + r.height / 2); }
  // zoom to z keeping the content under (px, py) where it is
  set(z, manual, px, py) {
    z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const s0 = this.svg.getBoundingClientRect(), z0 = this.cur();
    const u = px == null ? null : [(px - s0.left) / z0, (py - s0.top) / z0];
    if (manual) this.manual = true;
    this.apply(z);
    if (u) {
      const s1 = this.svg.getBoundingClientRect();
      this.c.scrollLeft += s1.left + u[0] * z - px;
      this.c.scrollTop += s1.top + u[1] * z - py;
    }
    this.save();
  }
  apply(z) {
    this.z = z;
    this.svg.style.zoom = String(Math.round(z * 1000) / 1000);
    if (this.bar) { this.out.disabled = z <= ZOOM_MIN + 0.001; this.in.disabled = z >= ZOOM_MAX - 0.001; this.bar.classList.toggle('manual', this.manual); }
  }
  save() { if (this.key) zoomMemo.set(this.key, { z: this.z, manual: this.manual }); }
}
