import { describe, expect, it, vi } from 'vitest';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import { persistQueryClientRestore, type PersistedClient, type Persister } from '@tanstack/react-query-persist-client';
import { PERSIST_BUSTER, shouldPersistQuery } from './persistPolicy';

function clientWith(entries: [unknown[], unknown][]): QueryClient {
  const client = new QueryClient();
  for (const [key, data] of entries) client.setQueryData(key, data);
  return client;
}

const savedKeys = (client: QueryClient) =>
  dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }).queries.map(q => q.queryKey[0]);

describe('what the query cache writes to disk', () => {
  it('never saves a DM thread, which holds decrypted text', () => {
    const client = clientWith([
      [['messages', 'conv-1'], { pages: [[{ id: 'm1', text: 'plaintext of an end-to-end encrypted message' }]], pageParams: [] }],
      [['messages', 'conv-2'], { pages: [[]], pageParams: [] }],
      [['feed'], [{ id: 'e1' }]],
    ]);
    expect(savedKeys(client)).toEqual(['feed']);
  });

  it('still saves everything else, so the app keeps starting from cache', () => {
    const client = clientWith([
      [['feed'], []],
      [['conversations'], []],
      [['profile', 'me'], {}],
      [['echo', 'e1'], {}],
    ]);
    expect(savedKeys(client).sort()).toEqual(['conversations', 'echo', 'feed', 'profile']);
  });

  it('does not mistake a key that merely contains the word for a thread', () => {
    const client = clientWith([[['messages-settings'], {}], [['unread-messages'], 3]]);
    expect(savedKeys(client).sort()).toEqual(['messages-settings', 'unread-messages']);
  });

  it('keeps default behaviour for failed queries (never saved)', () => {
    const client = new QueryClient();
    client.getQueryCache().build(client, { queryKey: ['broken'] }).setState({ status: 'error', error: new Error('x') } as never);
    expect(savedKeys(client)).toEqual([]);
  });
});

describe('plaintext saved by earlier versions', () => {
  function oldCache(buster: string): PersistedClient {
    return {
      timestamp: Date.now(),
      buster,
      clientState: {
        mutations: [],
        queries: [{
          queryKey: ['messages', 'conv-1'],
          queryHash: '["messages","conv-1"]',
          state: {
            data: { pages: [[{ id: 'm1', text: 'plaintext written by an earlier build' }]], pageParams: [] },
            dataUpdateCount: 1, dataUpdatedAt: Date.now(), error: null, errorUpdateCount: 0, errorUpdatedAt: 0,
            fetchFailureCount: 0, fetchFailureReason: null, fetchMeta: null, isInvalidated: false, status: 'success', fetchStatus: 'idle',
          },
        }],
      },
    } as unknown as PersistedClient;
  }

  function persisterHolding(saved: PersistedClient) {
    const removeClient = vi.fn(async () => {});
    const persister: Persister = { persistClient: async () => {}, restoreClient: async () => saved, removeClient };
    return { persister, removeClient };
  }

  it('is discarded and never loaded, because the buster no longer matches', async () => {
    const client = new QueryClient();
    const { persister, removeClient } = persisterHolding(oldCache(''));
    await persistQueryClientRestore({ queryClient: client, persister, buster: PERSIST_BUSTER, maxAge: 7 * 86_400_000 });
    expect(removeClient).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['messages', 'conv-1'])).toBeUndefined();
  });

  it('would have been loaded without the buster, which is the bug', async () => {
    const client = new QueryClient();
    const { persister, removeClient } = persisterHolding(oldCache(''));
    await persistQueryClientRestore({ queryClient: client, persister, buster: '', maxAge: 7 * 86_400_000 });
    expect(removeClient).not.toHaveBeenCalled();
    expect(client.getQueryData(['messages', 'conv-1'])).toBeDefined();
  });
});
