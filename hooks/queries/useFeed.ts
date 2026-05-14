import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { FeedItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchRankedFeed, fetchRemoteFeed, RankedFeedCursor } from '../../lib/supabaseEchoApi';
import { LOCAL_SEED_FEED, coerceFeedItem } from '../../lib/localFeedSeed';
import { computeScore, GRAVITY, deduplicateFeed } from '../../lib/feedScoring';

const PAGE_SIZE = 20;

// ─── Home feed (non-paginated, ~50 items) ────────────────────────────────────

export function useFeed() {
  const publishedEchoes = useAppStore(s => s.publishedEchoes);
  const likedIds        = useAppStore(s => s.likedIds);
  const bookmarkedIds   = useAppStore(s => s.bookmarkedIds);
  const feedSort        = useAppStore(s => s.feedSort);
  const feedScope       = useAppStore(s => s.feedScope);
  const followingIds    = useAppStore(s => s.followingIds);
  const blockedIds      = useAppStore(s => s.blockedIds);
  const mutedIds        = useAppStore(s => s.mutedIds);
  const notInterestedIds = useAppStore(s => s.notInterestedIds);
  const interests       = useAppStore(s => s.interests);
  const remote          = isSupabaseRemote();

  return useQuery({
    queryKey: remote
      ? ['feed', feedSort, feedScope, blockedIds, mutedIds, notInterestedIds]
      : ['feed', 'local', publishedEchoes, likedIds, bookmarkedIds, followingIds, feedSort, feedScope, blockedIds, mutedIds, notInterestedIds, interests],
    staleTime: remote ? 30_000 : Infinity,
    queryFn: async (): Promise<FeedItem[]> => {
      // O(1) lookups — never use Array.includes inside a filter loop.
      const blockSet = new Set([...blockedIds, ...mutedIds]);
      const skipSet  = new Set(notInterestedIds);
      const followSet = new Set(followingIds);

      const filterHidden = (list: FeedItem[]) =>
        list.filter(item => !blockSet.has(item.userId) && !skipSet.has(item.id));

      if (remote) {
        // Gravity: recency-heavy for 'latest', engagement-heavy for 'popular'.
        const gravity = feedSort === 'popular' ? GRAVITY.popular : GRAVITY.latest;
        try {
          const rows = await fetchRankedFeed({
            limit: 50,
            gravity,
            followingOnly: feedScope === 'following',
          });
          return filterHidden(rows);
        } catch (rankErr) {
          console.warn('[useFeed] ranked RPC failed, falling back to chronological:', rankErr);
          const rows = await fetchRemoteFeed({ limit: 50 });
          return filterHidden(rows);
        }
      }

      // ── Local / offline mode ──────────────────────────────────────────────
      const liked      = new Set(likedIds);
      const bookmarked = new Set(bookmarkedIds);
      const interestSet = new Set(interests);

      let merged = [...publishedEchoes.map(coerceFeedItem), ...LOCAL_SEED_FEED].map(item => ({
        ...item,
        isLiked: liked.has(item.id),
        isBookmarked: bookmarked.has(item.id),
      }));

      merged = filterHidden(merged);

      if (feedScope === 'following') {
        merged = merged.filter(item => followSet.has(item.userId) || item.userId === 'me');
      }

      const gravity = feedSort === 'popular' ? GRAVITY.popular : GRAVITY.latest;

      merged.sort((a, b) => {
        // Interest boost on top of the score — keeps interest matching as a
        // secondary signal without rewriting the gravity formula.
        const interestDelta =
          (interestSet.size > 0 && b.topicLabels?.some(t => interestSet.has(t)) ? 1 : 0) -
          (interestSet.size > 0 && a.topicLabels?.some(t => interestSet.has(t)) ? 1 : 0);
        if (interestDelta !== 0) return interestDelta;

        return computeScore(
          { likes: b.likes, commentCount: b.commentCount, repostCount: b.repostCount, viewCount: b.viewCount, createdAt: b.createdAt, postType: b.postType, isFollowing: followSet.has(b.userId) },
          gravity
        ) - computeScore(
          { likes: a.likes, commentCount: a.commentCount, repostCount: a.repostCount, viewCount: a.viewCount, createdAt: a.createdAt, postType: a.postType, isFollowing: followSet.has(a.userId) },
          gravity
        );
      });

      return merged;
    },
  });
}

// ─── Discover / infinite feed (paginated) ────────────────────────────────────

export function useInfiniteFeed() {
  const publishedEchoes  = useAppStore(s => s.publishedEchoes);
  const likedIds         = useAppStore(s => s.likedIds);
  const bookmarkedIds    = useAppStore(s => s.bookmarkedIds);
  const feedSort         = useAppStore(s => s.feedSort);
  const feedScope        = useAppStore(s => s.feedScope);
  const followingIds     = useAppStore(s => s.followingIds);
  const blockedIds       = useAppStore(s => s.blockedIds);
  const mutedIds         = useAppStore(s => s.mutedIds);
  const notInterestedIds = useAppStore(s => s.notInterestedIds);
  const interests        = useAppStore(s => s.interests);
  const remote           = isSupabaseRemote();

  return useInfiniteQuery<
    FeedItem[],
    Error,
    { pages: FeedItem[][] },
    unknown[],
    RankedFeedCursor
  >({
    queryKey: remote
      ? ['feed', 'paginated', feedSort, feedScope, blockedIds, mutedIds, notInterestedIds]
      : ['feed', 'paginated', 'local', publishedEchoes, likedIds, bookmarkedIds, followingIds, feedSort, feedScope, blockedIds, mutedIds, notInterestedIds, interests],
    initialPageParam: undefined,
    // Cursor carries (score, id) so keyset pagination is stable under new posts.
    getNextPageParam: (lastPage: FeedItem[]): RankedFeedCursor => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const last = lastPage[lastPage.length - 1];
      return last.rankScore != null ? { score: last.rankScore, id: last.id } : undefined;
    },
    staleTime: remote ? 30_000 : Infinity,
    queryFn: async ({ pageParam }): Promise<FeedItem[]> => {
      const blockSet  = new Set([...blockedIds, ...mutedIds]);
      const skipSet   = new Set(notInterestedIds);
      const followSet = new Set(followingIds);

      const filterHidden = (list: FeedItem[]) =>
        list.filter(item => !blockSet.has(item.userId) && !skipSet.has(item.id));

      if (remote) {
        const gravity = feedSort === 'popular' ? GRAVITY.popular : GRAVITY.latest;
        try {
          const rows = await fetchRankedFeed({
            limit: PAGE_SIZE,
            gravity,
            cursor: pageParam,
            followingOnly: feedScope === 'following',
          });
          return filterHidden(rows);
        } catch (rankErr) {
          console.warn('[useInfiniteFeed] ranked RPC failed, falling back:', rankErr);
          const cursor = typeof pageParam === 'object' && pageParam ? undefined : undefined;
          const rows = await fetchRemoteFeed({ limit: PAGE_SIZE, cursor });
          return filterHidden(rows);
        }
      }

      // Local: single page only.
      if (pageParam) return [];

      const liked      = new Set(likedIds);
      const bookmarked = new Set(bookmarkedIds);
      const interestSet = new Set(interests);

      let merged = [...publishedEchoes.map(coerceFeedItem), ...LOCAL_SEED_FEED].map(item => ({
        ...item,
        isLiked: liked.has(item.id),
        isBookmarked: bookmarked.has(item.id),
      }));

      merged = filterHidden(merged);

      if (feedScope === 'following') {
        merged = merged.filter(item => followSet.has(item.userId) || item.userId === 'me');
      }

      const gravity = feedSort === 'popular' ? GRAVITY.popular : GRAVITY.latest;

      merged.sort((a, b) => {
        const interestDelta =
          (interestSet.size > 0 && b.topicLabels?.some(t => interestSet.has(t)) ? 1 : 0) -
          (interestSet.size > 0 && a.topicLabels?.some(t => interestSet.has(t)) ? 1 : 0);
        if (interestDelta !== 0) return interestDelta;

        return computeScore(
          { likes: b.likes, commentCount: b.commentCount, repostCount: b.repostCount, viewCount: b.viewCount, createdAt: b.createdAt, postType: b.postType, isFollowing: followSet.has(b.userId) },
          gravity
        ) - computeScore(
          { likes: a.likes, commentCount: a.commentCount, repostCount: a.repostCount, viewCount: a.viewCount, createdAt: a.createdAt, postType: a.postType, isFollowing: followSet.has(a.userId) },
          gravity
        );
      });

      return merged.slice(0, PAGE_SIZE);
    },
    // Deduplicate across pages without changing the page count so React Query's
    // internal pageParams array stays consistent with the pages array length.
    select: (data) => {
      const seen = new Set<string>();
      return {
        ...data,
        pages: data.pages.map(page =>
          page.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          })
        ),
      };
    },
  });
}
