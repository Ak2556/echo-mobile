import { FeedItem } from '../types';

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
};

export function extractHashtags(text: string): string[] {
  const m = text.match(/#[\wÀ-ɏ]+/gi);
  return m ? [...new Set(m)] : [];
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|m4v|mov|webm|m3u8)(?:[?#]|$)/i.test(url);
}

export function mapEchoRowToFeedItem(
  echo: SupabaseEchoRow,
  author: SupabaseProfileRow | undefined,
  likedSet: Set<string>,
  bookmarkedSet: Set<string>,
  repostedSet: Set<string>
): FeedItem {
  const username = author?.username ?? 'unknown';
  const mediaUris = echo.media_urls?.length ? echo.media_urls : undefined;
  const videoUri = mediaUris?.find(isVideoUrl);
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
  };
}
