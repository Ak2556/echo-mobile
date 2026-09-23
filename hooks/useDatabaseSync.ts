import { useEffect } from 'react';
import { AppState } from 'react-native';
import { syncDatabase } from '../src/shared/database/sync';
import { useAppStore } from '../store/useAppStore';

/**
 * How often to sync while the app sits open.
 *
 * This was 15 seconds, which is 240 full syncs an hour per open app — 2.4
 * million an hour at ten thousand concurrent — almost all of them discovering
 * that nothing changed. It was that tight because live updates never arrived:
 * the app subscribes to direct_messages with postgres_changes, but the table
 * was not in the realtime publication, so the subscription was silently dead
 * (fixed in 20260923180000_realtime_publication.sql).
 *
 * With messages arriving live, this poll is the safety net for a dropped
 * socket rather than the delivery mechanism, so a minute is plenty. Coming
 * back to the foreground still syncs immediately, which is when staleness is
 * actually visible.
 */
const POLL_INTERVAL_MS = 60_000;

export function useDatabaseSync() {
  const userId = useAppStore(s => s.userId);

  useEffect(() => {
    if (!userId || userId === 'me') return;

    // Initial sync
    syncDatabase().catch(err => console.warn('Initial DB sync failed:', err));

    // Sync when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        syncDatabase().catch(err => console.warn('Foreground DB sync failed:', err));
      }
    });

    // Safety net for a dropped realtime socket, not the delivery path.
    const interval = setInterval(() => {
      syncDatabase().catch(err => console.warn('Polling DB sync failed:', err));
    }, POLL_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [userId]);
}
