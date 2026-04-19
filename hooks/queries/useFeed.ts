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
  const remote = isSupabaseRemote();

  return useQuery({
    queryKey: remote ? ['feed'] : ['feed', 'local', publishedEchoes.length, likeSig, bmSig],
    queryFn: async (): Promise<FeedItem[]> => {
      if (remote) {
        return fetchRemoteFeed();
      }
      await new Promise(r => setTimeout(r, 600));
      const { likedIds, bookmarkedIds } = useAppStore.getState();
      const liked = new Set(likedIds);
      const bookmarked = new Set(bookmarkedIds);
      const merged = [...publishedEchoes.map(coerceFeedItem), ...LOCAL_SEED_FEED].map(item => ({
        ...item,
        isLiked: liked.has(item.id),
        isBookmarked: bookmarked.has(item.id),
      }));
      return merged;
    },
  });
}
