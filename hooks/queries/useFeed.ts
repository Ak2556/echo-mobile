import { useQuery } from '@tanstack/react-query';
import { FeedItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchRemoteFeed } from '../../lib/supabaseEchoApi';
import { LOCAL_SEED_FEED, coerceFeedItem } from '../../lib/localFeedSeed';

export function useFeed() {
  const publishedEchoes = useAppStore(s => s.publishedEchoes);
  const likeSig = useAppStore(s => s.likedIds.join('|'));
  const bmSig = useAppStore(s => s.bookmarkedIds.join('|'));
  const feedSort = useAppStore(s => s.feedSort);
  const followingIds = useAppStore(s => s.followingIds);
  const remote = isSupabaseRemote();

  return useQuery({
    queryKey: remote ? ['feed', feedSort] : ['feed', 'local', publishedEchoes.length, likeSig, bmSig, feedSort],
    queryFn: async (): Promise<FeedItem[]> => {
      if (remote) {
        return fetchRemoteFeed();
      }
      await new Promise(r => setTimeout(r, 600));
      const { likedIds, bookmarkedIds } = useAppStore.getState();
      const liked = new Set(likedIds);
      const bookmarked = new Set(bookmarkedIds);
      let merged = [...publishedEchoes.map(coerceFeedItem), ...LOCAL_SEED_FEED].map(item => ({
        ...item,
        isLiked: liked.has(item.id),
        isBookmarked: bookmarked.has(item.id),
      }));

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

      return merged;
    },
  });
}
