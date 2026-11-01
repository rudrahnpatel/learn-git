// WebAudio-synthesised sound cues. No audio files. The context is created lazily on the first
// cue (which always follows a user gesture), and every call is a no-op when muted or unsupported.
let ctx = null, master = null, muted = false;

export function setMuted(m) { muted = !!m; }
export const isMuted = () => muted;

function ac() {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

// One enveloped oscillator note.
function note(freq, start, dur, { type = 'triangle', vol = 0.6, slide = null, attack = 0.008 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(start, dur, { vol = 0.25, from = 800, to = 4000 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + start;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}

const N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568, C4: 261.63, G4: 392, E4: 329.63 };

export const sfx = {
  tap() { note(880, 0, 0.05, { type: 'sine', vol: 0.25 }); },
  pop() { note(520, 0, 0.09, { type: 'sine', vol: 0.35, slide: 900 }); },
  correct() { note(N.E5, 0, 0.12, { vol: 0.5 }); note(N.C6, 0.09, 0.26, { vol: 0.55 }); },
  wrong() { note(233, 0, 0.16, { type: 'square', vol: 0.12, slide: 200 }); note(185, 0.13, 0.26, { type: 'square', vol: 0.12, slide: 150 }); },
  combo() { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => note(f, i * 0.06, 0.14, { vol: 0.4 })); },
  complete() {
    [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => note(f, i * 0.11, 0.18, { vol: 0.45 }));
    [N.C5, N.E5, N.G5, N.C6].forEach((f) => note(f, 0.5, 0.9, { vol: 0.22, type: 'sine' }));
    note(N.E6, 0.5, 0.9, { vol: 0.18, type: 'triangle' });
  },
  // A release ships: a rising whoosh as the tag drops, a thunk as it lands, then a chime.
  release() {
    noise(0, 0.3, { vol: 0.16, from: 300, to: 3500 });
    note(N.C4, 0.28, 0.12, { type: 'sine', vol: 0.45, slide: 180 });
    [N.G5, N.C6, N.E6, N.G6, N.E6, N.G6].forEach((f, i) => note(f, 0.36 + i * 0.07, 0.2, { vol: 0.3, type: 'sine' }));
  },
  // The reward crate rattles before it opens: a few short wooden knocks.
  rattle() { [0, 0.11, 0.2, 0.32, 0.41].forEach((t, i) => note(i % 2 ? 190 : 150, t, 0.06, { type: 'square', vol: 0.09, slide: 110 })); },
  // Branch lines join on the merge screen: two notes that resolve.
  merge() { note(N.G4, 0, 0.14, { vol: 0.35 }); note(N.C5, 0.06, 0.14, { vol: 0.35 }); note(N.E5, 0.16, 0.3, { vol: 0.4, type: 'sine' }); },
  // A stash goes into the box: a soft drop and a click.
  stash() { note(660, 0, 0.1, { type: 'sine', vol: 0.3, slide: 330 }); note(N.C5, 0.1, 0.08, { type: 'triangle', vol: 0.3 }); },
  streak() {
    noise(0, 0.45, { vol: 0.22, from: 300, to: 5000 });
    note(N.C4, 0.05, 0.5, { type: 'sawtooth', vol: 0.08, slide: N.C6 });
    [N.G5, N.C6, N.E6].forEach((f, i) => note(f, 0.42 + i * 0.09, 0.3, { vol: 0.35 }));
  },
  unlock() { note(N.G5, 0, 0.08, { type: 'sine', vol: 0.3 }); note(N.C6, 0.07, 0.16, { type: 'sine', vol: 0.35 }); },
  // A purchase: coins counting out, then a bright "ta-da" as the item goes on.
  buy() { [0, 0.06, 0.12, 0.18].forEach((t) => note(1400, t, 0.04, { type: 'triangle', vol: 0.16 })); note(N.E5, 0.28, 0.12, { vol: 0.35 }); note(N.A5, 0.38, 0.24, { vol: 0.4, type: 'sine' }); },
  // A card turns over: a papery swish.
  flip() { noise(0, 0.12, { vol: 0.12, from: 2000, to: 600 }); },
  // A card is revealed; legendary cards get a longer sparkle.
  reveal(rare = false) { [N.C6, N.E6, N.G6].forEach((f, i) => note(f, i * 0.07, 0.18, { vol: 0.25, type: 'sine' })); if (rare) [N.G6, N.E6, N.G6, 2093].forEach((f, i) => note(f, 0.3 + i * 0.08, 0.2, { vol: 0.18, type: 'triangle' })); },
};
