import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSuggestedUsers } from '../../lib/supabaseEchoApi';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { getSessionUserId } from '../../lib/supabaseEchoApi';
import { useEffect, useState } from 'react';

export function useSuggestedUsers() {
  const remote = isSupabaseRemote();
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    if (remote) getSessionUserId().then(setUid).catch(() => setUid(null));
  }, [remote]);

  return useQuery({
    queryKey: ['suggested-users', uid],
    queryFn: fetchSuggestedUsers,
    enabled: remote && !!uid,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
