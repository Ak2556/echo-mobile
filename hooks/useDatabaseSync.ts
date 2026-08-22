import { useEffect } from 'react';
import { AppState } from 'react-native';
import { syncDatabase } from '../src/shared/database/sync';
import { useAppStore } from '../store/useAppStore';

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

    // Poll every 15 seconds
    const interval = setInterval(() => {
      syncDatabase().catch(err => console.warn('Polling DB sync failed:', err));
    }, 15000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [userId]);
}
