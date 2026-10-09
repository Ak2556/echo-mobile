import { useQuery } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/core/remoteConfig';
import { createAltTextLoader } from '../../lib/social/altTextLoader';

// The API module is loaded on first use, not with this file: MediaGrid imports this
// hook, and the feed grid must not pull the whole API (and its native modules) in at
// load for the sake of a request only a screen reader makes.
const loader = createAltTextLoader({
  fetchMany: async (ids) => (await import('../../lib/supabaseEchoApi')).fetchEchoAltTexts(ids),
});

/**
 * A post's photo descriptions. Callers render this only while a screen reader is
 * running (see MediaGrid), so nobody else pays for the request. Descriptions
 * rarely change, so they are kept for ten minutes.
 */
export function useEchoAltTexts(echoId: string | undefined): string[] | undefined {
  const q = useQuery({
    queryKey: ['echo-alt', echoId],
    enabled: !!echoId && isSupabaseRemote(),
    staleTime: 10 * 60_000,
    queryFn: () => loader.load(echoId!),
  });
  return q.data;
}
