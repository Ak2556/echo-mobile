import { useQuery } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/core/remoteConfig';
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

      const topicMatches = topicMatchesFrom(echoes, trimmed);

      return { userMatches: users, echoMatches: echoes, topicMatches };
    },
  });
}

/**
 * Topics whose name contains the query, counted over the posts the search
 * returned. It used to list every hashtag on those posts, so "nature" also
 * offered #echo and #newpost because one matching post carried all three
 * (2026-11-27).
 */
export function topicMatchesFrom(echoes: Pick<FeedItem, 'hashtags'>[], query: string): { topic: string; count: number }[] {
  const q = query.trim().replace(/^#/, '').toLowerCase();
  const counts = new Map<string, number>();
  for (const echo of echoes) {
    for (const tag of echo.hashtags ?? []) {
      if (q && tag.toLowerCase().includes(q)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count }));
}
