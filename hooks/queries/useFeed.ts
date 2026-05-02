import { useQuery } from '@tanstack/react-query';
import { FeedItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchRemoteFeed } from '../../lib/supabaseEchoApi';
import { LOCAL_SEED_FEED, coerceFeedItem } from '../../lib/localFeedSeed';

export function useFeed() {
  const publishedEchoes = useAppStore(s => s.publishedEchoes);
  const likedIds = useAppStore(s => s.likedIds);
  const bookmarkedIds = useAppStore(s => s.bookmarkedIds);
  const feedSort = useAppStore(s => s.feedSort);
  const feedScope = useAppStore(s => s.feedScope);
  const followingIds = useAppStore(s => s.followingIds);
  const blockedIds = useAppStore(s => s.blockedIds);
  const mutedIds = useAppStore(s => s.mutedIds);
  const notInterestedIds = useAppStore(s => s.notInterestedIds);
  const remote = isSupabaseRemote();

  return useQuery({
    queryKey: remote
      ? ['feed', feedSort, feedScope, blockedIds, mutedIds, notInterestedIds]
      : ['feed', 'local', publishedEchoes, likedIds, bookmarkedIds, followingIds, feedSort, feedScope, blockedIds, mutedIds, notInterestedIds],
    staleTime: remote ? 1000 * 30 : Infinity,
    queryFn: async (): Promise<FeedItem[]> => {
      const blockSet = new Set([...blockedIds, ...mutedIds]);
      const skipIds = new Set(notInterestedIds);
      const filterHidden = (list: FeedItem[]) =>
        list.filter(item => !blockSet.has(item.userId) && !skipIds.has(item.id));
      if (remote) {
        const rows = await fetchRemoteFeed();
        const filtered = filterHidden(rows);
        return feedScope === 'following'
          ? filtered.filter(item => followingIds.includes(item.userId) || item.userId === 'me')
          : filtered;
      }
      const liked = new Set(likedIds);
      const bookmarked = new Set(bookmarkedIds);
      let merged = [...publishedEchoes.map(coerceFeedItem), ...LOCAL_SEED_FEED].map(item => ({
        ...item,
        isLiked: liked.has(item.id),
        isBookmarked: bookmarked.has(item.id),
      }));

      merged = filterHidden(merged);

      // Apply feed sort
      switch (feedSort) {
        case 'popular':
          merged.sort((a, b) => (b.likes + b.repostCount + b.commentCount) - (a.likes + a.repostCount + a.commentCount));
          break;
        case 'following':
          merged = merged.filter(item => followingIds.includes(item.userId) || item.userId === 'me');
          break;
        default: // 'latest'
          merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          break;
      }

      if (feedScope === 'following') {
        merged = merged.filter(item => followingIds.includes(item.userId) || item.userId === 'me');
      }

      return merged;
    },
  });
}
