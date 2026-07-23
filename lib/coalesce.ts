// Coalesce rapid fire-and-forget work: repeated calls with the same key within
// `delay` ms collapse into a single trailing run using the latest payload. Used
// to keep the structured cloud mirrors from firing a burst of writes on every
// rapid interaction (e.g. tapping water +250 five times) — the UI stays instant
// while the network sees one reconcile.

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const latest = new Map<string, unknown>();

export function coalesce<T>(key: string, payload: T, run: (p: T) => void, delay = 800): void {
  latest.set(key, payload);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      const p = latest.get(key) as T;
      latest.delete(key);
      run(p);
    }, delay),
  );
}
