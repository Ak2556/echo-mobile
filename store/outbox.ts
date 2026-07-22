import { create } from 'zustand';
import { persistGet, persistSet } from './persist';

/**
 * Persisted write outbox. Holds writes that couldn't reach the server yet
 * (offline, or interrupted) so they survive app-kill and replay when
 * connectivity returns. Idempotency is the caller's responsibility (toggles are
 * naturally idempotent; inserts carry a client id) so a replay can't duplicate.
 */
export type OutboxStatus = 'pending' | 'failed';

export interface OutboxOp {
  id: string;
  /** Registry key selecting the replay handler. */
  type: string;
  /** Serializable arguments for the handler. */
  payload: unknown;
  createdAt: number;
  attempts: number;
  status: OutboxStatus;
  lastError?: string;
}

/** RFC4122-ish v4 — good enough for idempotency keys / client-supplied PKs. */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface OutboxStore {
  ops: OutboxOp[];
  enqueue: (type: string, payload: unknown) => OutboxOp;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<OutboxOp>) => void;
  clearFailed: () => void;
}

const KEY = 'outbox_ops_v1';

function save(ops: OutboxOp[]) {
  persistSet(KEY, ops);
}

export const useOutbox = create<OutboxStore>((set, get) => ({
  ops: persistGet<OutboxOp[]>(KEY, []),
  enqueue: (type, payload) => {
    const op: OutboxOp = {
      id: uuidv4(),
      type,
      payload,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
    };
    const ops = [...get().ops, op];
    save(ops);
    set({ ops });
    return op;
  },
  remove: (id) => {
    const ops = get().ops.filter((o) => o.id !== id);
    save(ops);
    set({ ops });
  },
  update: (id, patch) => {
    const ops = get().ops.map((o) => (o.id === id ? { ...o, ...patch } : o));
    save(ops);
    set({ ops });
  },
  clearFailed: () => {
    const ops = get().ops.filter((o) => o.status !== 'failed');
    save(ops);
    set({ ops });
  },
}));

/** Non-hook accessors for use outside React (processor, mutationFns). */
export const outbox = {
  enqueue: (type: string, payload: unknown) => useOutbox.getState().enqueue(type, payload),
  pending: () => useOutbox.getState().ops.filter((o) => o.status === 'pending'),
  all: () => useOutbox.getState().ops,
  remove: (id: string) => useOutbox.getState().remove(id),
  update: (id: string, patch: Partial<OutboxOp>) => useOutbox.getState().update(id, patch),
};
