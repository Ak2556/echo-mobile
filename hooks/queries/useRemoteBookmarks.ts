import { useQuery } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchRemoteBookmarkedFeed } from '../../lib/supabaseEchoApi';

export function useRemoteBookmarks() {
  return useQuery({
    queryKey: ['bookmarks'],
    enabled: isSupabaseRemote(),
    staleTime: 60_000,
    queryFn: () => fetchRemoteBookmarkedFeed(),
  });
}
