import { useMemo } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { FeedItem } from '../../../../types/index';
import { useAppStore } from '../../../../store/useAppStore';
import { isSupabaseRemote } from '../../../../lib/remoteConfig';
import { captureException } from '../../../../lib/monitoring';
import {
  fetchRankedFeed,
  fetchRemoteFeed,
  fetchPersonalFeed,
  fetchSimilarEchoes,
  fetchTrendingEvolutions,
  fetchRemixTree,
  RankedFeedCursor,
} from '../../../../lib/supabaseEchoApi';
import { LOCAL_SEED_FEED, coerceFeedItem } from '../../../../lib/localFeedSeed';
import { computeScore, GRAVITY } from '../../../../lib/feedScoring';

const PAGE_SIZE = 20;

// Home feed (non-paginated, ~50 items)
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
  // Stable per-mount seed so exploration sampling doesn't re-roll on every refetch.
  const sessionSeed = useMemo(() => Math.floor(Math.random() * 1_000_000), []);

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
        // Semantic ("For You") scope routes to the personal ranker, which
        // blends follow/semantic/trending/exploration candidates server-side
        // and falls back to the ranked feed internally for users who can't
        // be profiled. We double-fallback on RPC error too.
        if (feedScope === 'semantic') {
          try {
            const rows = await fetchPersonalFeed({ limit: 50, sessionSeed });
            const filtered = filterHidden(rows);
            if (filtered.length > 0) return filtered;
            // No personal results yet (e.g. fresh install) — fall through
            // to ranked feed so the surface is never empty.
          } catch (personalErr) {
            captureException(personalErr, { tags: { hook: 'useFeed', fallback: 'ranked' } });
          }
        }
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
          captureException(rankErr, { tags: { hook: 'useFeed', fallback: 'chronological' } });
          const rows = await fetchRemoteFeed({ limit: 50 });
          return filterHidden(rows);
        }
      }

      // Local / offline mode
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

// Similar echoes ("more like this" rail)
export function useSimilarEchoes(echoId: string | undefined, limit = 6) {
  const remote = isSupabaseRemote();
  return useQuery({
    queryKey: ['similar-echoes', echoId, limit],
    enabled: !!echoId && remote,
    staleTime: 60_000,
    queryFn: () => fetchSimilarEchoes(String(echoId), limit),
  });
}

// Trending evolutions (Evolutions tab)
export function useTrendingEvolutions(limit = 30) {
  const remote = isSupabaseRemote();
  return useQuery({
    queryKey: ['trending-evolutions', limit],
    enabled: remote,
    staleTime: 60_000,
    queryFn: () => fetchTrendingEvolutions(limit),
  });
}

// Single remix tree (Evolution detail view)
export function useRemixTree(rootId: string | undefined) {
  const remote = isSupabaseRemote();
  return useQuery({
    queryKey: ['remix-tree', rootId],
    enabled: !!rootId && remote,
    staleTime: 30_000,
    queryFn: () => fetchRemixTree(String(rootId)),
  });
}

// Discover / infinite feed (paginated)
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
  // Stable per-mount seed: passed to get_personal_feed so page 2+ samples
  // the same exploration set as page 1 instead of re-rolling and
  // duplicating/skipping rows across the scroll session.
  const sessionSeed = useMemo(() => Math.floor(Math.random() * 1_000_000), []);

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
      // The personal-feed diversity trim can reject rows scoring above
      // everything it kept; fetchPersonalFeed stamps the deepest candidate it
      // actually examined onto the last item as `personalFeedCursor`. Using
      // that instead of this item's own rankScore is what stops the rejected
      // rows from being re-fetched, re-rejected, and eating page capacity on
      // every later page. Absent on the ranked/fallback paths, which fall
      // through to the plain rankScore cursor below.
      if (last.personalFeedCursor) return last.personalFeedCursor;
      return last.rankScore != null ? { score: last.rankScore, id: last.id } : undefined;
    },
    staleTime: remote ? 30_000 : Infinity,
    queryFn: async ({ pageParam }): Promise<FeedItem[]> => {
      const blockSet  = new Set([...blockedIds, ...mutedIds]);
      const skipSet   = new Set(notInterestedIds);
      const followSet = new Set(followingIds);

      const filterHidden = (list: FeedItem[]) =>
        list.filter(item => item.postType !== 'video' && !item.videoUri && !blockSet.has(item.userId) && !skipSet.has(item.id));

      if (remote) {
        // Remote pages are returned RAW here; block/mute/not-interested filtering
        // happens in `select` (below). Filtering in queryFn used to shrink a page
        // under PAGE_SIZE, which tripped getNextPageParam's length check and made
        // the feed dead-end early for anyone who'd blocked/muted someone.

        // Latest: pure chronological, no ranking, no personalisation (DSA Art. 27 opt-out).
        if (feedScope === 'latest') {
          if (pageParam) return [];
          return fetchRemoteFeed({ limit: PAGE_SIZE * 3 });
        }

        // Semantic ("For You") scope routes to the personal ranker. The RPC
        // falls back internally to the ranked feed for users who can't be
        // profiled, so an empty/failed first page still falls through below;
        // later pages just stop rather than switch ranking systems mid-scroll
        // (the ranked feed's cursor isn't meaningful against personal scores).
        if (feedScope === 'semantic') {
          try {
            const rows = await fetchPersonalFeed({ limit: PAGE_SIZE, cursor: pageParam, sessionSeed });
            if (rows.length > 0 || pageParam) return rows;
          } catch (personalErr) {
            captureException(personalErr, { tags: { hook: 'useInfiniteFeed', fallback: 'ranked' } });
            if (pageParam) return [];
          }
        }

        const gravity = feedSort === 'popular' ? GRAVITY.popular : GRAVITY.latest;
        try {
          return await fetchRankedFeed({
            limit: PAGE_SIZE,
            gravity,
            cursor: pageParam,
            followingOnly: feedScope === 'following',
          });
        } catch (rankErr) {
          captureException(rankErr, { tags: { hook: 'useInfiniteFeed', fallback: 'chronological' } });
          // On ranked-RPC failure we can't translate the (score,id) cursor to the
          // chronological feed, so only the first page falls back — subsequent
          // pages stop rather than repeat page 1.
          if (pageParam) return [];
          return fetchRemoteFeed({ limit: PAGE_SIZE });
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
    // Hide blocked/muted/not-interested items and dedup across pages — for
    // display only, so pagination still counts raw server pages. Page count is
    // preserved so React Query's pageParams array stays consistent.
    select: (data) => {
      const blockSet = new Set([...blockedIds, ...mutedIds]);
      const skipSet = new Set(notInterestedIds);
      const seen = new Set<string>();
      return {
        ...data,
        pages: data.pages.map(page =>
          page.filter(item => {
            if (item.postType === 'video' || !!item.videoUri) return false; // Isolate videos from home feed
            if (blockSet.has(item.userId) || skipSet.has(item.id)) return false;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          })
        ),
      };
    },
  });
}

// Watch / Shorts feed (video only)
export function useInfiniteVideoFeed() {
  const publishedEchoes  = useAppStore(s => s.publishedEchoes);
  const blockedIds       = useAppStore(s => s.blockedIds);
  const mutedIds         = useAppStore(s => s.mutedIds);
  const notInterestedIds = useAppStore(s => s.notInterestedIds);
  const remote           = isSupabaseRemote();

  return useInfiniteQuery<
    FeedItem[],
    Error,
    { pages: FeedItem[][] },
    unknown[],
    string | undefined
  >({
    queryKey: remote
      ? ['feed', 'videos', blockedIds, mutedIds, notInterestedIds]
      : ['feed', 'videos', 'local', publishedEchoes, blockedIds, mutedIds, notInterestedIds],
    initialPageParam: undefined,
    getNextPageParam: (lastPage: FeedItem[]) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].createdAt;
    },
    staleTime: remote ? 30_000 : Infinity,
    queryFn: async ({ pageParam }): Promise<FeedItem[]> => {
      const blockSet  = new Set([...blockedIds, ...mutedIds]);
      const skipSet   = new Set(notInterestedIds);

      const filterHidden = (list: FeedItem[]) =>
        list.filter(item => !blockSet.has(item.userId) && !skipSet.has(item.id));

      if (remote) {
        const remoteFeed = await fetchRemoteFeed({ limit: PAGE_SIZE, cursor: pageParam, postType: 'video' });
        
        if (!pageParam) {
          const localVideos = publishedEchoes
            .map(coerceFeedItem)
            .filter(i => i.postType === 'video' || !!i.videoUri);
            
          const remoteIds = new Set(remoteFeed.map(r => r.id));
          const newLocals = localVideos.filter(l => !remoteIds.has(l.id));
          
          return filterHidden([...newLocals, ...remoteFeed]);
        }
        
        return filterHidden(remoteFeed);
      }

      // Local fallback
      let merged = [...publishedEchoes.map(coerceFeedItem), ...LOCAL_SEED_FEED]
        .filter(i => i.postType === 'video' || !!i.videoUri);

      merged = filterHidden(merged);
      merged.sort((a, b) => a.createdAt > b.createdAt ? -1 : 1);
      
      // Cursor pagination locally
      if (pageParam) {
        merged = merged.filter(i => i.createdAt < pageParam);
      }
      return merged.slice(0, PAGE_SIZE);
    },
    select: (data) => {
      const blockSet = new Set([...blockedIds, ...mutedIds]);
      const skipSet = new Set(notInterestedIds);
      const seen = new Set<string>();
      return {
        ...data,
        pages: data.pages.map(page =>
          page.filter(item => {
            if (blockSet.has(item.userId) || skipSet.has(item.id)) return false;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          })
        ),
      };
    },
  });
}
