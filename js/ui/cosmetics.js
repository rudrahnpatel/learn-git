// The mascot's wardrobe: the shop catalogue and the paper-cut art for each item. Pure strings, no DOM,
// so game.js (prices, locks) and twig.js (drawing) can both import it. Cosmetics are global, not
// per course: the mascot wears the same beanie in every course.
//
// Art is drawn in the reference mascot's coordinates (Twig: viewBox 0 0 120 140, body circle at
// 60,88 r42, eyes at y 80, resting right hand at 100,98) and placed through REF_ANCHORS. Each item:
//   back(mood)  drawn behind Twig (a hood)        front(mood) drawn over him
//   over        true when the sprout pokes through the hat (it is drawn again on top)
// Colours are theme tokens; --on-accent is always dark and --on-iris always white.

export const SLOTS = [
  { id: 'head', label: 'Hats', note: 'One at a time' },
  { id: 'face', label: 'Face' },
  { id: 'neck', label: 'Neck & body' },
  { id: 'held', label: 'In hand' },
  { id: 'ring', label: 'Profile ring', note: 'Behind Twig on your profile' },
  { id: 'theme', label: 'App accent', note: 'Recolours every button' },
];

const D = 'var(--on-accent)';   // dark detail, both themes
const W = 'var(--on-iris)';     // white detail, both themes

// Every item is drawn against these reference anchors (Twig's, see js/ui/mascot-twig.js). twig.js
// moves and scales each slot onto the current mascot's own anchors, so a new mascot only has to
// declare where its head, face, neck and hand are. Held items are drawn at the resting hand; the
// mascot's held anchor moves them when it cheers.
export const REF_ANCHORS = { head: { x: 60, y: 46, w: 84 }, face: { x: 60, y: 80, w: 28 }, neck: { x: 60, y: 112, w: 78 }, held: { x: 100, y: 98, w: 20 } };
const paw = '<circle cx="100" cy="103" r="6.5" fill="var(--yellow)"/>';

export const ITEMS = [
  /* --------------------------------------------------------------- hats */
  { id: 'beanie', slot: 'head', name: 'Branch beanie', price: 100, blurb: 'Knitted, warm, with a git-branch pin.', over: true,
    front: () => `<path d="M26 60 Q26 27 60 27 Q94 27 94 60 Z" fill="var(--red)"/>
      <path d="M40 58 Q40 36 50 30 M60 58 V28 M80 58 Q80 36 70 30" stroke="${D}" stroke-opacity=".18" stroke-width="3" fill="none"/>
      <rect x="22" y="56" width="76" height="13" fill="var(--pink)"/>
      <circle cx="80" cy="62.5" r="8.5" fill="${W}"/>
      <path d="M77 67 V58 M77 63 Q77 59.5 83 59" stroke="var(--green)" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="77" cy="67" r="1.9" fill="${D}"/><circle cx="77" cy="58" r="1.9" fill="${D}"/><circle cx="83.5" cy="59" r="1.9" fill="${D}"/>` },
  { id: 'party', slot: 'head', name: 'Release party hat', price: 120, blurb: 'For every tag you ship.',
    front: () => `<polygon points="21,73 49,48 10,27" fill="var(--sky)"/>
      <polygon points="29,66 40,56 22,48 17,53" fill="var(--pink)"/><polygon points="16,40 13,34 27,40 24,44" fill="var(--pink)"/>
      <circle cx="10" cy="27" r="5.5" fill="var(--red)"/>` },
  { id: 'headphones', slot: 'head', name: 'Focus headphones', price: 180, blurb: 'Lo-fi beats to rebase to.',
    front: () => `<path d="M17 86 C14 30 106 30 103 86" stroke="${D}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <rect x="8" y="70" width="17" height="30" rx="8" fill="var(--sky)"/><rect x="95" y="70" width="17" height="30" rx="8" fill="var(--sky)"/>
      <rect x="18" y="74" width="7" height="22" rx="3.5" fill="${D}"/><rect x="95" y="74" width="7" height="22" rx="3.5" fill="${D}"/>` },
  { id: 'hardhat', slot: 'head', name: 'Merge-conflict hard hat', price: 220, blurb: 'Safety first when the markers appear.', over: true,
    front: () => `<path d="M25 58 Q25 22 60 22 Q95 22 95 58 Z" fill="var(--combo)"/>
      <rect x="55" y="23" width="10" height="35" fill="var(--sunbeam)"/>
      <rect x="13" y="55" width="94" height="9" fill="var(--crate-side)"/>
      <polygon points="31,52 41.5,33 52,52" fill="var(--yellow)"/>
      <rect x="40" y="38.5" width="3" height="7.5" fill="${D}"/><rect x="40" y="47.5" width="3" height="3" fill="${D}"/>` },
  { id: 'crown', slot: 'head', name: 'Streak crown', price: 400, blurb: 'Only for a 30-day commit line.', lock: 'streak30',
    front: () => `<polygon points="35,54 33,30 46,41 60,25 74,41 87,30 85,54" fill="var(--crate-top)"/>
      <rect x="35" y="47" width="50" height="8" fill="var(--crate-side)"/>
      <circle cx="48" cy="51" r="2.6" fill="var(--red)"/><circle cx="60" cy="51" r="2.6" fill="var(--sky)"/><circle cx="72" cy="51" r="2.6" fill="var(--green)"/>` },

  /* --------------------------------------------------------------- face */
  { id: 'glasses', slot: 'face', name: 'Round glasses', price: 70, blurb: 'For reading diffs up close.',
    front: () => `<path d="M24 76 L35 79 M85 79 L96 76" stroke="${D}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="46" cy="80" r="11.5" fill="var(--sky)" fill-opacity=".28" stroke="${D}" stroke-width="3.2"/>
      <circle cx="74" cy="80" r="11.5" fill="var(--sky)" fill-opacity=".28" stroke="${D}" stroke-width="3.2"/>
      <path d="M57.5 79 Q60 76 62.5 79" stroke="${D}" stroke-width="3" fill="none"/>` },

  /* ------------------------------------------------------- neck & body */
  { id: 'bowtie', slot: 'neck', name: 'Bow tie', price: 40, blurb: 'Smart enough for a code review.',
    front: () => `<polygon points="46,110 60,117 46,124" fill="var(--red)"/><polygon points="74,110 60,117 74,124" fill="var(--red)"/>
      <rect x="56.5" y="113.5" width="7" height="7" rx="2" fill="var(--crate-band)"/>` },
  { id: 'scarf', slot: 'neck', name: 'Striped scarf', price: 60, blurb: 'Cosy for long rebases.',
    front: () => `<path d="M21 106 Q60 124 99 106 L100 117 Q60 136 20 117 Z" fill="var(--green)"/>
      <path d="M40 115.5 L40 127 M60 119.5 V131 M80 115.5 V127" stroke="${W}" stroke-width="4" stroke-opacity=".75"/>
      <polygon points="70,120 82,118 86,140 74,141" fill="var(--green)"/>
      <path d="M75 133 L85 132" stroke="${W}" stroke-width="3.5" stroke-opacity=".75"/>` },
  { id: 'hoodie', slot: 'neck', name: 'Hoodie', price: 260, blurb: 'The official uniform of late-night commits.',
    back: () => '<path d="M13 100 A47 47 0 0 1 107 100 Z" fill="var(--iris-soft)"/>',
    front: () => `<path d="M21.2 104 A42 42 0 0 0 98.8 104 Z" fill="var(--iris-soft)"/>
      <path d="M44 117 H76 L72 127 H48 Z" fill="${D}" fill-opacity=".2"/>
      <path d="M53 104 L51 115 M67 104 L69 115" stroke="${W}" stroke-width="2.5" stroke-linecap="round"/>` },

  /* --------------------------------------------------------------- held */
  { id: 'mug', slot: 'held', name: 'Commit mug', price: 80, blurb: 'Coffee in, commits out.',
    front: () => (`<path d="M112 98 a6 6 0 0 1 0 12" stroke="${W}" stroke-width="3.5" fill="none"/>
      <rect x="95" y="92" width="18" height="22" rx="3" fill="${W}"/><rect x="96.5" y="93" width="15" height="4" fill="var(--crate-band)"/>
      <path d="M99 105 H109" stroke="var(--green)" stroke-width="2"/><circle cx="104" cy="105" r="3" fill="var(--green)"/>${paw}`) },
  { id: 'duck', slot: 'held', name: 'Debugging duck', price: 140, blurb: 'Explain your bug to it. It works.',
    front: () => (`<ellipse cx="107" cy="106" rx="12" ry="9" fill="var(--sunbeam)"/><circle cx="111" cy="93" r="7" fill="var(--sunbeam)"/>
      <polygon points="117,92 124,94.5 117,97" fill="var(--combo)"/><circle cx="112.5" cy="91.5" r="1.6" fill="${D}"/>
      <path d="M100 104 q6 5 13 0" stroke="var(--crate-side)" stroke-width="2" fill="none"/>${paw}`) },
  { id: 'laptop', slot: 'held', name: 'Tiny laptop', price: 300, blurb: 'Stickered, of course.',
    front: () => (`<rect x="88" y="88" width="30" height="21" rx="3" fill="${D}"/>
      <circle cx="103" cy="98.5" r="5" fill="var(--yellow)"/><path d="M103 94 V91 M103 93 Q103 90.5 106 90" stroke="var(--green)" stroke-width="1.6" fill="none"/>
      <rect x="111" y="91" width="4.5" height="4.5" fill="var(--pink)"/>
      <polygon points="85,109 121,109 117,114 89,114" fill="var(--frost-2)"/>${paw}`) },

  /* ------------------------------------------------------ profile ring */
  { id: 'ring-confetti', slot: 'ring', name: 'Confetti ring', price: 90, blurb: 'A party around your avatar.' },
  { id: 'ring-sunburst', slot: 'ring', name: 'Sunburst', price: 240, blurb: 'Rays for a shining profile.' },

  /* --------------------------------------------------------- app accent */
  { id: 'accent-green', slot: 'theme', name: 'Merge green', price: 200, blurb: 'Every button turns merge-commit green.', swatch: 'var(--accent-green)' },
  { id: 'accent-berry', slot: 'theme', name: 'Hotfix berry', price: 350, blurb: 'A bold berry for every action.', swatch: 'var(--accent-berry)' },
];

export const itemById = (id) => ITEMS.find((i) => i.id === id) || null;

// The profile ring: a separate square SVG layered behind the avatar (it is wider than Twig).
export function ringSVG(id) {
  if (id === 'ring-confetti') {
    const cols = ['red', 'sky', 'yellow', 'green', 'pink', 'sunbeam'];
    let s = '';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, x = 50 + Math.cos(a) * 44, y = 50 + Math.sin(a) * 44;
      const col = `var(--${cols[i % cols.length]})`, rot = (i * 47) % 360;
      s += i % 3 === 0 ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${col}"/>`
        : i % 3 === 1 ? `<rect x="${(x - 3.5).toFixed(1)}" y="${(y - 3.5).toFixed(1)}" width="7" height="7" fill="${col}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`
          : `<polygon points="${x.toFixed(1)},${(y - 4.5).toFixed(1)} ${(x + 4).toFixed(1)},${(y + 3).toFixed(1)} ${(x - 4).toFixed(1)},${(y + 3).toFixed(1)}" fill="${col}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
    return `<svg viewBox="0 0 100 100" class="ring-svg" aria-hidden="true">${s}</svg>`;
  }
  if (id === 'ring-sunburst') {
    let s = '';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, b = a + Math.PI / 16;
      const p = (r, t) => `${(50 + Math.cos(t) * r).toFixed(1)},${(50 + Math.sin(t) * r).toFixed(1)}`;
      s += `<polygon points="${p(20, a)} ${p(50, a + Math.PI / 32)} ${p(20, b)}" fill="${i % 2 ? 'var(--sunbeam)' : 'var(--yellow)'}"/>`;
    }
    return `<svg viewBox="0 0 100 100" class="ring-svg" aria-hidden="true">${s}</svg>`;
  }
  return '';
}

// Thumbnail crop of Twig for a shop card, per slot (the item in context, not floating).
export const THUMB_VIEW = { head: '2 2 116 90', face: '16 54 88 54', neck: '6 78 108 64', held: '62 62 66 66' };
