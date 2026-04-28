import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { FeedItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchRemoteFeed } from '../../lib/supabaseEchoApi';
import { LOCAL_SEED_FEED, coerceFeedItem } from '../../lib/localFeedSeed';

function sortFeed(items: FeedItem[], feedSort: string, followingIds: string[]): FeedItem[] {
  const merged = [...items];
  switch (feedSort) {
    case 'popular':
      return merged.sort(
        (a, b) =>
          b.likes + b.repostCount + b.commentCount -
          (a.likes + a.repostCount + a.commentCount),
      );
    case 'following':
      return merged.filter(i => followingIds.includes(i.userId) || i.userId === 'me');
    default:
      return merged.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }
}

export function useFeed() {
  const publishedEchoes = useAppStore(s => s.publishedEchoes);
  const feedSort        = useAppStore(s => s.feedSort);
  const followingIds    = useAppStore(s => s.followingIds);
  // likedIds / bookmarkedIds are NOT in the query key — they are applied via select()
  // so toggling a like never triggers a refetch, only a synchronous remap.
  const likedIds        = useAppStore(s => s.likedIds);
  const bookmarkedIds   = useAppStore(s => s.bookmarkedIds);
  const remote          = isSupabaseRemote();

  // Stable set references — only rebuild when the underlying arrays change, not on every render.
  const likedSet      = useMemo(() => new Set(likedIds), [likedIds]);
  const bookmarkedSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);

  return useQuery({
    queryKey: remote
      ? ['feed', feedSort]
      : ['feed', 'local', publishedEchoes.length, feedSort],
    queryFn: async (): Promise<FeedItem[]> => {
      if (remote) {
        try {
          return await fetchRemoteFeed();
        } catch {
          // Network unavailable — fall back to local seed so the feed never errors out
        }
      }
      return sortFeed(
        [...publishedEchoes.map(coerceFeedItem), ...LOCAL_SEED_FEED],
        feedSort,
        followingIds,
      );
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    select: (items) => items.map(item => ({
      ...item,
      isLiked:      likedSet.has(item.id),
      isBookmarked: bookmarkedSet.has(item.id),
    })),
  });
}
