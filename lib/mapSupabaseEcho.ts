import { EchoReaction, FeedItem, ReactionCounts } from '../types';
import { isVideoUri } from './videoMedia';

export type SupabaseProfileRow = {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_color: string;
  avatar_url?: string | null;
  is_verified: boolean;
  created_at: string;
  follower_count?: number;
  mood?: string | null;
  mood_expires_at?: string | null;
  pronouns?: string | null;
  /** ID of the echo the user has pinned to their profile, or null. */
  pinned_echo_id?: string | null;
};

export type SupabaseEchoRow = {
  id: string;
  author_id: string;
  title: string;
  prompt: string;
  response: string;
  likes_count: number;
  comment_count: number;
  repost_count: number;
  view_count: number;
  created_at: string;
  media_urls?: string[] | null;
  quoted_echo_id?: string | null;
  parent_echo_id?: string | null;
  remix_root_id?: string | null;
  remix_count?: number | null;
  thoughtfulness_score?: number | null;
  rank_score?: number;
  distance?: number;
  /** Knowledge-reaction counters (added by Gen Z feature pack). */
  mind_blown_count?: number | null;
  taking_notes_count?: number | null;
  agree_count?: number | null;
  disagree_count?: number | null;
  /** Co-echo: collaborative post with a second author. */
  co_author_id?: string | null;
  co_author_response?: string | null;
};

/** Build a ReactionCounts object from a raw echo row's reaction columns. */
export function rowToReactionCounts(echo: SupabaseEchoRow): ReactionCounts {
  return {
    mind_blown:   echo.mind_blown_count   ?? 0,
    taking_notes: echo.taking_notes_count ?? 0,
    agree:        echo.agree_count        ?? 0,
    disagree:     echo.disagree_count     ?? 0,
  };
}

/** Check whether a profile's mood field is still within its 24h window. */
export function isMoodActive(mood?: string | null, expiresAt?: string | null): boolean {
  if (!mood || !expiresAt) return false;
  return new Date(expiresAt).getTime() > Date.now();
}

export function extractHashtags(text: string): string[] {
  const m = text.match(/#[\wÀ-ɏ]+/gi);
  return m ? [...new Set(m)] : [];
}

export function mapEchoRowToFeedItem(
  echo: SupabaseEchoRow,
  author: SupabaseProfileRow | undefined,
  likedSet: Set<string>,
  bookmarkedSet: Set<string>,
  repostedSet: Set<string>,
  userReactions?: EchoReaction[],
  coAuthor?: SupabaseProfileRow | undefined,
): FeedItem {
  const username = author?.username ?? 'unknown';
  const mediaUris = echo.media_urls?.length ? echo.media_urls : undefined;
  const videoUri = mediaUris?.find(isVideoUri);
  const moodActive = isMoodActive(author?.mood, author?.mood_expires_at);
  return {
    id: echo.id,
    userId: echo.author_id,
    username,
    displayName: author?.display_name || username,
    avatarColor: author?.avatar_color || '#3B82F6',
    avatarUrl: author?.avatar_url ?? undefined,
    isVerified: author?.is_verified ?? false,
    prompt: echo.prompt,
    response: echo.response,
    likes: echo.likes_count ?? 0,
    isLiked: likedSet.has(echo.id),
    isBookmarked: bookmarkedSet.has(echo.id),
    isReposted: repostedSet.has(echo.id),
    repostCount: echo.repost_count ?? 0,
    commentCount: echo.comment_count ?? 0,
    viewCount: echo.view_count ?? 0,
    reactionCounts: rowToReactionCounts(echo),
    userReactions,
    authorMood: moodActive ? (author?.mood ?? null) : null,
    hashtags: extractHashtags(`${echo.prompt} ${echo.response}`),
    createdAt: echo.created_at,
    postType: videoUri ? 'video' : mediaUris ? 'photo' : 'text',
    mediaUris: videoUri ? undefined : mediaUris,
    videoUri,
    quotedEchoId: echo.quoted_echo_id ?? undefined,
    rankScore: echo.rank_score ?? undefined,
    parentEchoId: echo.parent_echo_id ?? undefined,
    remixRootId: echo.remix_root_id ?? undefined,
    remixCount: echo.remix_count ?? undefined,
    thoughtfulnessScore: echo.thoughtfulness_score ?? undefined,
    semanticDistance: echo.distance ?? undefined,
    postOrigin: echo.parent_echo_id ? 'remix' : undefined,
    coAuthor: echo.co_author_id ? {
      id: echo.co_author_id,
      username: coAuthor?.username ?? 'unknown',
      displayName: coAuthor?.display_name || coAuthor?.username || 'unknown',
      avatarColor: coAuthor?.avatar_color || '#3B82F6',
      avatarUrl: coAuthor?.avatar_url ?? undefined,
      isVerified: coAuthor?.is_verified ?? false,
    } : undefined,
    coAuthorResponse: echo.co_author_response ?? undefined,
  };
}
