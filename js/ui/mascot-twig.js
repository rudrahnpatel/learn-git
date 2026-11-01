// Twig, the default mascot: the base drawing and the anchor points accessories attach to.
// Pure strings, no DOM. js/brand.js picks the mascot; js/ui/twig.js composes accessories onto it
// (js/ui/cosmetics.js) through the anchors, so a different mascot only needs its own module with
// the same shape: { id, name, viewBox, draw(mood, { back, front, over }), anchors, overlay }.
// Twig stays yellow in both themes: the face is always dark ink on the yellow body, while the
// sprout stem and feet follow the theme so they still read on a dark canvas.
const INK = 'var(--on-accent)';
const STEM = 'var(--ink)';

function face(mood) {
  // eyes
  let eyes;
  if (mood === 'happy' || mood === 'cheer') {
    eyes = `<path d="M40 82 q6 -8 12 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M68 82 q6 -8 12 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  } else {
    const dy = mood === 'think' ? -3 : 0, dx = mood === 'think' ? 3 : 0;
    eyes = `<ellipse cx="46" cy="${80 + dy}" rx="5.5" ry="7.5" fill="${INK}"/><ellipse cx="74" cy="${80 + dy}" rx="5.5" ry="7.5" fill="${INK}"/>
            <circle cx="${47.5 + dx}" cy="${77 + dy}" r="2" fill="var(--on-iris)"/><circle cx="${75.5 + dx}" cy="${77 + dy}" r="2" fill="var(--on-iris)"/>`;
  }
  let brows = '';
  if (mood === 'worried') brows = `<path d="M38 70 l12 -4" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><path d="M82 70 l-12 -4" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
  let mouth;
  if (mood === 'cheer') mouth = `<path d="M50 94 h20 q0 14 -10 14 q-10 0 -10 -14z" fill="${INK}"/><path d="M54 102 q6 -4 12 0 q-2 6 -6 6 q-4 0 -6 -6z" fill="var(--red)"/>`;
  else if (mood === 'happy') mouth = `<path d="M50 95 q10 12 20 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  else if (mood === 'worried') mouth = `<path d="M52 101 q8 -7 16 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  else if (mood === 'think') mouth = `<path d="M54 98 h12" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  else mouth = `<path d="M52 96 q8 7 16 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  return eyes + brows + mouth;
}

const SPROUT = `<g class="tw-sprout">
      <path d="M60 50 V20" stroke="${STEM}" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M60 40 C60 30 72 30 80 22" stroke="${STEM}" stroke-width="4" stroke-linecap="round" fill="none"/>
      <polygon points="60,30 44,24 52,38" fill="var(--green)"/>
      <circle cx="60" cy="16" r="7" fill="var(--iris)"/>
      <circle cx="83" cy="19" r="7" fill="var(--red)"/>
    </g>`;


function draw(mood = 'idle', { back = '', front = '', over = '' } = {}) {
  const armsUp = mood === 'cheer';
  const arms = armsUp
    ? `<circle class="tw-arm l" cx="9" cy="56" r="8.5" fill="var(--yellow)"/><circle class="tw-arm r" cx="111" cy="56" r="8.5" fill="var(--yellow)"/>`
    : `<circle class="tw-arm l" cx="20" cy="98" r="10" fill="var(--yellow)"/><circle class="tw-arm r" cx="100" cy="98" r="10" fill="var(--yellow)"/>`;
  return `${back}
    ${SPROUT}
    <g class="tw-feet"><path d="M36 138 a11 11 0 0 1 22 0z" fill="var(--twig-feet)"/><path d="M62 138 a11 11 0 0 1 22 0z" fill="var(--twig-feet)"/></g>
    ${arms}
    <circle cx="60" cy="88" r="42" fill="var(--yellow)"/>
    <path d="M28 100 a32 30 0 0 0 64 0z" fill="var(--sunbeam)"/>
    <circle cx="35" cy="96" r="6.5" fill="var(--pink)"/><circle cx="85" cy="96" r="6.5" fill="var(--pink)"/>
    ${face(mood)}
    ${front}${over}`;
}

// Anchors, in this mascot's viewBox units: where each accessory slot sits and how wide it is.
//   head: top centre of the head, w = head width     face: between the eyes, w = eye spacing
//   neck: under the chin, w = body width there        held: the right hand (moves when cheering)
// js/ui/cosmetics.js draws every item against Twig's own anchors, so for Twig the mapping is 1:1.
export const TWIG = {
  id: 'twig',
  name: 'Twig',
  viewBox: '0 0 120 140',
  draw,
  overlay: SPROUT,          // drawn again over a hat that lets the sprout poke through
  anchors: {
    head: { x: 60, y: 46, w: 84 },
    face: { x: 60, y: 80, w: 28 },
    neck: { x: 60, y: 112, w: 78 },
    held: (mood) => (mood === 'cheer' ? { x: 111, y: 56, w: 20 } : { x: 100, y: 98, w: 20 }),
  },
};
