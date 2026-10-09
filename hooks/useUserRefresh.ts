import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state that belongs to the user. A query's `isRefetching` is true on
 * every background refetch, so binding it to <RefreshControl refreshing> draws the
 * ring whenever the app refetches on its own (foreground, invalidation, an OTA
 * relaunch), not only when someone pulls.
 */
export function useUserRefresh(refetch: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.resolve()
      .then(refetch)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}
