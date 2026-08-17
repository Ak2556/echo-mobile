import { Persister } from '@tanstack/react-query-persist-client';
import { storage } from '../store/persist';

const CACHE_KEY = 'REACT_QUERY_OFFLINE_CACHE';

/**
 * A synchronous storage persister powered by MMKV (via the app's existing store/persist.ts).
 * This persists the entire React Query cache to disk instantly, allowing the app to render
 * immediately on cold start without waiting for network requests—a crucial step toward
 * a true Offline-First architecture.
 */
export const mmkvPersister: Persister = {
  persistClient: async (client) => {
    try {
      storage.set(CACHE_KEY, JSON.stringify(client));
    } catch (err) {
      if (__DEV__) console.warn('Failed to persist react query cache', err);
    }
  },
  restoreClient: async () => {
    const cache = storage.getString(CACHE_KEY);
    if (!cache) return undefined;
    try {
      return JSON.parse(cache);
    } catch {
      return undefined;
    }
  },
  removeClient: async () => {
    storage.delete(CACHE_KEY);
  },
};
