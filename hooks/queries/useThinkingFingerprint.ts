import { useQuery } from '@tanstack/react-query';
import { fetchThinkingFingerprint } from '../../lib/supabaseEchoApi';
import { isSupabaseRemote } from '../../lib/remoteConfig';

/**
 * An AI-synthesised portrait of how a user thinks, derived from the embeddings
 * and content of their published echoes. Returns null until the user has enough
 * echoes for a meaningful read. Cached server-side, so it's cheap to re-query.
 */
export function useThinkingFingerprint(userId: string | undefined) {
  const remote = isSupabaseRemote();
  return useQuery({
    queryKey: ['thinking-fingerprint', userId],
    queryFn: () => fetchThinkingFingerprint(userId as string),
    enabled: remote && !!userId,
    staleTime: 1000 * 60 * 30, // the fingerprint is itself cached server-side
    retry: false,
  });
}
