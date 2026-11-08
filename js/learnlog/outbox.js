// The analytics outbox: batches events in memory, mirrors them to storage (so a batch survives going
// offline or closing the tab), caps how many it keeps, and hands batches to a send function.
// Pure: storage, send and the clock are injected, so tests/analytics.test.mjs drives it in node.
//
//   const q = createQueue({ load, store, send })
//   q.push(row)          -> true when a batch is worth sending now
//   await q.flush()      -> sends up to one batch (all batches with { all: true })
//
// send(rows, { unloading }) resolves to 'ok' (stored), 'drop' (the server refused these rows, so
// retrying won't help) or 'retry' (network / server trouble: the rows go back to the front of the
// queue). A thrown error counts as 'retry'. Nothing here ever throws to the caller.

export const QUEUE_CAP = 200;        // events kept while offline; the oldest are dropped first
export const BATCH_MAX = 50;         // events per request
export const BATCH_BYTES = 48000;    // a keepalive request body must stay under 64 KB (all in flight)
export const FLUSH_AT = 20;          // push() says "flush now" at this many queued events

// 2xx stored; 408 / 429 / 5xx / no response are worth retrying; any other 4xx never will be
// (no table yet, a row the policy refuses), so those rows are dropped instead of piling up.
export function classify(status) {
  if (status >= 200 && status < 300) return 'ok';
  if (!status || status === 408 || status === 429 || status >= 500) return 'retry';
  return 'drop';
}

// Keeps the newest `cap` rows.
export const capRows = (rows, cap = QUEUE_CAP) => (rows.length > cap ? rows.slice(rows.length - cap) : rows);

// The first rows that fit in one request: at most `max` rows and `bytes` of JSON (always at least one).
export function takeBatch(rows, max = BATCH_MAX, bytes = BATCH_BYTES) {
  let size = 2, n = 0;
  for (const r of rows) {
    const len = JSON.stringify(r).length + 1;
    if (n >= max || (n > 0 && size + len > bytes)) break;
    size += len; n++;
  }
  return [rows.slice(0, n), rows.slice(n)];
}

export function createQueue({ load = () => [], store = () => {}, send, cap = QUEUE_CAP, batchMax = BATCH_MAX, batchBytes = BATCH_BYTES, flushAt = FLUSH_AT } = {}) {
  let rows = [];
  try { const saved = load(); if (Array.isArray(saved)) rows = capRows(saved.filter((r) => r && typeof r === 'object'), cap); } catch { /* corrupt: start empty */ }
  const persist = () => { try { store(rows); } catch { /* storage full or blocked: memory only */ } };

  async function sendOne(opts) {
    if (!rows.length) return false;
    const [batch, rest] = takeBatch(rows, batchMax, batchBytes);
    rows = rest;
    persist();
    let verdict;
    try { verdict = await send(batch, opts); } catch { verdict = 'retry'; }
    if (verdict === 'retry') {
      rows = capRows(batch.concat(rows), cap);
      persist();
      return false;
    }
    return true;
  }

  return {
    get size() { return rows.length; },
    rows: () => rows.slice(),
    push(row) {
      rows = capRows(rows.concat([row]), cap);
      persist();
      return rows.length >= flushAt;
    },
    // Sends one batch, or every batch with { all: true } (stops at the first failure).
    async flush({ all = false, unloading = false } = {}) {
      try {
        do { if (!(await sendOne({ unloading }))) break; } while (all && rows.length && !unloading);
      } catch { /* never throw into the UI */ }
    },
  };
}
