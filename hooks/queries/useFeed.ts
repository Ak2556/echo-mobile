import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
          const merged = [...publishedEchoes.map(coerceFeedItem), ...LOCAL_SEED_FEED];
          return sortFeed(merged, feedSort, followingIds);
        }
      }
      const merged = [...publishedEchoes.map(coerceFeedItem), ...LOCAL_SEED_FEED];
      return sortFeed(merged, feedSort, followingIds);
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    select: (items) => {
      const liked      = new Set(likedIds);
      const bookmarked = new Set(bookmarkedIds);
      return items.map(item => ({
        ...item,
        isLiked:      liked.has(item.id),
        isBookmarked: bookmarked.has(item.id),
      }));
    },
  });
}
