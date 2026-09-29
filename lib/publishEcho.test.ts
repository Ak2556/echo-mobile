import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertRemoteEcho = vi.fn();
const drainOutbox = vi.fn(async () => {});
vi.mock('./supabaseEchoApi', () => ({ insertRemoteEcho: (p: unknown) => insertRemoteEcho(p) }));
vi.mock('./outboxProcessor', () => ({ drainOutbox: () => drainOutbox() }));
vi.mock('./mutationErrors', () => ({
  // The real classifier: network, timeout and 5xx are transient.
  isTransientError: (e: { message?: string; status?: number }) =>
    /network request failed|timed out/i.test(e?.message ?? '') || (e?.status ?? 0) >= 500,
}));

import { publishOrQueue } from './publishEcho';
import { outbox, useOutbox } from '../store/outbox';

const payload = { id: '0b8e3f00-0000-4000-8000-000000000001', authorId: 'u1', prompt: 'hello', response: 'world' };

beforeEach(() => {
  insertRemoteEcho.mockReset();
  drainOutbox.mockClear();
  useOutbox.getState().clearAll();
});

describe('publishOrQueue', () => {
  it('publishes when the insert succeeds, and queues nothing', async () => {
    insertRemoteEcho.mockResolvedValue({ id: payload.id });
    await expect(publishOrQueue(payload)).resolves.toEqual({ status: 'published', id: payload.id });
    expect(outbox.all()).toHaveLength(0);
  });

  it('a timeout queues the same payload under the same id instead of dropping the post', async () => {
    // The insert may still land after this: the queued replay then finds it by
    // id (insertRemoteEcho treats 23505 on a caller id as the existing post).
    insertRemoteEcho.mockRejectedValue(new Error('publish timed out after 20000ms'));
    await expect(publishOrQueue(payload)).resolves.toEqual({ status: 'queued', id: payload.id });
    const queued = outbox.all();
    expect(queued).toHaveLength(1);
    expect(queued[0].type).toBe('publish');
    expect((queued[0].payload as { id: string }).id).toBe(payload.id);
    expect(drainOutbox).toHaveBeenCalledTimes(1);
  });

  it('a network failure or 5xx queues too', async () => {
    insertRemoteEcho.mockRejectedValueOnce(new Error('Network request failed'));
    await publishOrQueue(payload);
    insertRemoteEcho.mockRejectedValueOnce({ message: 'bad gateway', status: 502 });
    await publishOrQueue({ ...payload, id: '0b8e3f00-0000-4000-8000-000000000002' });
    expect(outbox.all()).toHaveLength(2);
  });

  it('a permanent rejection reaches the caller and is not queued', async () => {
    const rls = { code: '42501', message: 'new row violates row-level security policy', status: 403 };
    insertRemoteEcho.mockRejectedValue(rls);
    await expect(publishOrQueue(payload)).rejects.toBe(rls);
    expect(outbox.all()).toHaveLength(0);
    expect(drainOutbox).not.toHaveBeenCalled();
  });
});
