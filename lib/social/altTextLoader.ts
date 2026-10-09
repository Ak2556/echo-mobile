/**
 * Alt text for many posts in one request.
 *
 * A screen reader is on and a screenful of cards mounts at once: asking for each
 * post's descriptions separately would be a request per card. Callers ask for one
 * id each; ids that arrive within a short window are fetched together, and each
 * caller gets back only its own.
 *
 * Pure (the fetch and the clock are injected) so the batching is tested.
 */
export interface AltTextLoaderOptions {
  fetchMany: (ids: string[]) => Promise<Record<string, string[]>>;
  /** How long to gather ids before sending. */
  windowMs?: number;
  /** The most ids in one request; a larger crowd is sent as several. */
  maxBatch?: number;
  schedule?: (fn: () => void, ms: number) => unknown;
}

type Waiter = { resolve: (v: string[]) => void; reject: (e: unknown) => void };

export function createAltTextLoader(opts: AltTextLoaderOptions) {
  const windowMs = opts.windowMs ?? 30;
  const maxBatch = opts.maxBatch ?? 50;
  const schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const waiting = new Map<string, Waiter[]>();
  let scheduled = false;

  async function sendChunk(ids: string[], waiters: Map<string, Waiter[]>) {
    try {
      const found = await opts.fetchMany(ids);
      for (const id of ids) for (const w of waiters.get(id) ?? []) w.resolve(found[id] ?? []);
    } catch (e) {
      for (const id of ids) for (const w of waiters.get(id) ?? []) w.reject(e);
    }
  }

  function flush() {
    scheduled = false;
    const batch = new Map(waiting);
    waiting.clear();
    const ids = [...batch.keys()];
    for (let i = 0; i < ids.length; i += maxBatch) void sendChunk(ids.slice(i, i + maxBatch), batch);
  }

  return {
    load(id: string): Promise<string[]> {
      return new Promise<string[]>((resolve, reject) => {
        const list = waiting.get(id) ?? [];
        list.push({ resolve, reject });
        waiting.set(id, list);
        if (!scheduled) {
          scheduled = true;
          schedule(flush, windowMs);
        }
      });
    },
  };
}
