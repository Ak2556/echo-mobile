/**
 * Collect ids for a short window, then act on the distinct set once.
 *
 * A read receipt on a 30-message backlog is 30 realtime UPDATE events in a burst.
 * Answering each with its own query would be 30 round trips; this turns the burst
 * into one. A burst bigger than `maxBatch` is not worth chasing id by id, so it is
 * handed to `overflow` (refetch the thread) instead.
 */
export interface IdBatcherOptions {
  windowMs: number;
  maxBatch: number;
  flush: (ids: string[]) => Promise<void>;
  overflow: () => void;
  onError?: (error: unknown) => void;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface IdBatcher {
  add: (id: string) => void;
  /** Drop anything pending (the screen is closing). */
  dispose: () => void;
}

export function createIdBatcher(opts: IdBatcherOptions): IdBatcher {
  const schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = opts.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let pending = new Set<string>();
  let handle: unknown = null;
  let disposed = false;

  const run = () => {
    handle = null;
    if (disposed) return;
    const ids = [...pending];
    pending = new Set();
    if (ids.length === 0) return;
    if (ids.length > opts.maxBatch) { opts.overflow(); return; }
    opts.flush(ids).catch((e) => {
      opts.onError?.(e);
      opts.overflow();
    });
  };

  return {
    add(id) {
      if (disposed) return;
      pending.add(id);
      if (handle === null) handle = schedule(run, opts.windowMs);
    },
    dispose() {
      disposed = true;
      pending = new Set();
      if (handle !== null) cancel(handle);
      handle = null;
    },
  };
}
