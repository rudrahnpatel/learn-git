// The one module the app imports for first-party lesson stats (.notes/analytics-supabase.md).
// The real code (js/learnlog/send.js) is loaded with a dynamic import, never a static one: content blockers
// such as uBlock Origin block anything that looks like analytics, and a blocked *static* import fails the whole
// module graph, which left the app as a blank page. Here a blocked or failed load only loses the stats.
//   track(name, props)   fire and forget; calls made before the code has loaded are kept (up to 50) and sent then
//   analyticsOn()        false until the stats code has loaded and decided it may send
let mod = null, failed = false, loading = null;
const early = [];

export function loadStats() {
  if (!loading) {
    loading = import('./learnlog/send.js')
      .then((m) => { mod = m; for (const [n, p] of early.splice(0)) m.track(n, p); })
      .catch(() => { failed = true; early.length = 0; });
  }
  return loading;
}

export function track(name, props) {
  try {
    if (mod) return mod.track(name, props);
    if (failed) return;
    if (early.length < 50) early.push([name, props]);
    loadStats();
  } catch { /* stats must never break the app */ }
}

export function analyticsOn() {
  try { return mod ? mod.analyticsOn() : false; } catch { return false; }
}
