// Landing page behaviour outside the hero lesson: the scroll-drawn history rail, stats and reward words from
// config.js, the command-card quiz, the reel (plays only while on screen) and the closing merge. No dependencies.
const cfg = window.LEARN_GIT_SITE || {};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Numbers and swappable reward wording come from config.js.
document.querySelectorAll('[data-stat]').forEach((el) => { el.textContent = cfg.STATS?.[el.dataset.stat] ?? ''; });
const saver = document.getElementById('wk-saver');
if (saver && cfg.BRAND?.STREAK_SAVER) saver.textContent = cfg.BRAND.STREAK_SAVER;

// History rail: each commit section draws its segment of the line when it scrolls into view.
// Without JS, or with reduced motion, or without IntersectionObserver, the line is simply fully drawn.
const commits = [...document.querySelectorAll('.log .c')];
if (!reduced && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('draw');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -18% 0px', threshold: 0 });
  // anything already above the fold (or scrolled past, e.g. a #start deep link) is drawn at once
  for (const c of commits) { if (c.getBoundingClientRect().top < innerHeight * 0.82) c.classList.add('in'); else io.observe(c); }
} else commits.forEach((c) => c.classList.add('in'));

// Command card: one real fill-the-blank exercise.
const quiz = document.getElementById('quiz');
if (quiz) {
  const blank = document.getElementById('quiz-blank');
  const fb = document.getElementById('quiz-fb');
  const WHY = {
    soft: 'Yes. --soft moves the branch back one commit and leaves everything staged, ready to commit again.',
    hard: 'Ouch: --hard throws the changes away too. (The reflog could still save you.) Try again.',
    mixed: 'Close: --mixed keeps the changes but unstages them. That is the default. Try again.',
  };
  quiz.addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (!b) return;
    const a = b.dataset.a;
    quiz.querySelectorAll('.opt').forEach((o) => o.classList.remove('wrong'));
    void b.offsetWidth;
    if (a === 'soft') {
      b.classList.add('right'); blank.textContent = 'soft'; blank.classList.add('filled');
      quiz.querySelectorAll('.opt').forEach((o) => { o.disabled = o !== b; o.setAttribute('aria-pressed', String(o === b)); });
    } else b.classList.add('wrong');
    fb.textContent = WHY[a];
  });
}

// Reel: muted, loops, plays only while visible (and never on its own under reduced motion), with a real toggle.
const vid = document.querySelector('.reel video');
const toggle = document.querySelector('.reel-toggle');
if (vid && toggle) {
  let userPaused = reduced;
  const label = () => { toggle.textContent = vid.paused ? 'Play reel' : 'Pause reel'; };
  vid.addEventListener('play', label); vid.addEventListener('pause', label);
  toggle.addEventListener('click', () => { if (vid.paused) { userPaused = false; vid.play().catch(() => {}); } else { userPaused = true; vid.pause(); } });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !userPaused) vid.play().catch(() => {});
      else if (!e.isIntersecting && !vid.paused) vid.pause();
    }, { threshold: 0.4 }).observe(vid);
  }
}

// Closing CTA: the "you" branch merges into main when you reach for the button (hover or keyboard focus).
const end = document.getElementById('start');
const go = document.getElementById('go');
if (end && go) {
  const merge = () => {
    if (end.classList.contains('joined')) return;
    end.classList.add('joined');
    const tw = end.querySelector('.cta-twig');
    const say = document.getElementById('cta-say');
    if (say) say.textContent = 'Merged. Off you go.';
    if (tw && !reduced) { tw.classList.remove('hop'); void tw.offsetWidth; tw.classList.add('hop'); }
  };
  go.addEventListener('pointerenter', merge); go.addEventListener('focus', merge);
}
