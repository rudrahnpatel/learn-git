// On-screen keyboard (phones), shared by the lesson player and the terminal + graph screens (challenge, bisect hunt,
// sandbox). With interactive-widget=resizes-content (index.html) Chrome Android shrinks the layout viewport; iOS
// Safari only shrinks the visual viewport. So while a text input inside `el` is focused on a narrow, short screen,
// body.kb is set and the screen is pinned to the visual viewport through --vvt/--vvh; the CSS (`.kb .lesson`,
// `.kb .challenge`) then compacts it. See .notes/learn-git-v2-ui.md ("Fit to viewport", "Phone view switcher").
const TEXT = 'input:not([type]), input[type=text], textarea';

export function watchKeyboard(el, { reveal = false, onChange } = {}) {
  const vv = window.visualViewport;
  let was = false;
  function sync() {
    const a = document.activeElement;
    const typing = !!a && el.isConnected && el.contains(a) && !a.disabled && a.matches(TEXT);
    const vh = vv ? vv.height : window.innerHeight;
    const on = typing && window.innerWidth <= 760 && vh < 560;
    document.body.classList.toggle('kb', on);
    if (on) {
      document.body.style.setProperty('--vvh', Math.round(vh) + 'px');
      document.body.style.setProperty('--vvt', Math.round(vv ? vv.offsetTop : 0) + 'px');
      if (reveal) requestAnimationFrame(() => a.scrollIntoView({ block: 'nearest' }));
    } else clearVars();
    if (on !== was) { was = on; onChange?.(on); }
  }
  const later = () => setTimeout(sync, 0);
  el.addEventListener('focusin', sync); el.addEventListener('focusout', later);
  vv?.addEventListener('resize', sync); vv?.addEventListener('scroll', sync); window.addEventListener('resize', sync);
  return {
    sync,
    destroy() {
      el.removeEventListener('focusin', sync); el.removeEventListener('focusout', later);
      vv?.removeEventListener('resize', sync); vv?.removeEventListener('scroll', sync); window.removeEventListener('resize', sync);
      document.body.classList.remove('kb'); clearVars();
    },
  };
}
function clearVars() { document.body.style.removeProperty('--vvh'); document.body.style.removeProperty('--vvt'); }

// Keep the keyboard up: a tap on this control must not take the focus from a focused text input (on touch screens the
// compatibility mousedown is what moves the focus, so cancelling it keeps the input focused and the keyboard open).
export function keepFocus(btn) {
  btn.addEventListener('mousedown', (e) => { if (document.activeElement?.matches?.(TEXT)) e.preventDefault(); });
  return btn;
}
