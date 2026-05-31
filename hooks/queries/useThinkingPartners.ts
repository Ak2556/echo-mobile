import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  fetchThinkingPartners,
  getSessionUserId,
  type ThinkingPartnerMode,
} from '../../lib/supabaseEchoApi';
import { isSupabaseRemote } from '../../lib/remoteConfig';

/**
 * Surfaces users matched by embedding-centroid similarity:
 *   mode 'similar'   → kindred minds
 *   mode 'different' → productive friction
 */
export function useThinkingPartners(mode: ThinkingPartnerMode) {
  const remote = isSupabaseRemote();
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    if (remote) getSessionUserId().then(setUid).catch(() => setUid(null));
  }, [remote]);

  return useQuery({
    queryKey: ['thinking-partners', mode, uid],
    queryFn: () => fetchThinkingPartners(mode),
    enabled: remote && !!uid,
    staleTime: 1000 * 60 * 10, // centroids move slowly; 10 min is plenty
  });
}
