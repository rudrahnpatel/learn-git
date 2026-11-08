// Long commands in body text (`git log --oneline --graph --all`) must wrap only at their spaces: browsers also
// break after "-", which splits flags like "--oneline" across lines. Each space-separated token of an inline
// <code> in prose gets wrapped in a nowrap span, so the only break opportunities left are the spaces.
// Works for everything rendered later too (a MutationObserver), since screens are built dynamically.
const SEL = 'p code, li code, .card code, .sheet-explain code, .learn-body code, code.ccard-cmd';

function wrapTokens(code) {
  if (code.dataset.wrapped || code.children.length || !/\s/.test(code.textContent.trim())) return;
  code.dataset.wrapped = '1';
  const parts = code.textContent.split(/(\s+)/);
  code.textContent = '';
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) code.append(part.includes('\n') ? '\n' : ' '); // keep line breaks (a multi-line answer)
    else { const s = document.createElement('span'); s.className = 'tok'; s.textContent = part; code.append(s); }
  }
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches?.(SEL)) wrapTokens(root);
  root.querySelectorAll?.(SEL).forEach(wrapTokens);
}

scan(document.body);
new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach(scan); })
  .observe(document.body, { childList: true, subtree: true });
