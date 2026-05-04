import { useQuery } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { searchRemoteProfiles, searchRemoteEchoes } from '../../lib/supabaseEchoApi';
import { FeedItem, User } from '../../types';

export interface RemoteSearchResults {
  userMatches: User[];
  echoMatches: FeedItem[];
  topicMatches: { topic: string; count: number }[];
}

export function useRemoteSearch(query: string) {
  const trimmed = query.trim();
  return useQuery<RemoteSearchResults>({
    queryKey: ['search', trimmed],
    enabled: trimmed.length >= 2 && isSupabaseRemote(),
    staleTime: 1000 * 20,
    queryFn: async (): Promise<RemoteSearchResults> => {
      const [users, echoes] = await Promise.all([
        searchRemoteProfiles(trimmed),
        searchRemoteEchoes(trimmed),
      ]);

      // Derive topic matches from returned echoes
      const topicCounts = new Map<string, number>();
      for (const echo of echoes) {
        for (const tag of echo.hashtags ?? []) {
          topicCounts.set(tag, (topicCounts.get(tag) ?? 0) + 1);
        }
      }
      const topicMatches = [...topicCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([topic, count]) => ({ topic, count }));

      return { userMatches: users, echoMatches: echoes, topicMatches };
    },
  });
}
