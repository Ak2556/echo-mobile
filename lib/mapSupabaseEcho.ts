import { FeedItem } from '../types';

export type SupabaseProfileRow = {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_color: string;
  is_verified: boolean;
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
};

export function extractHashtags(text: string): string[] {
  const m = text.match(/#[\w\u00c0-\u024f]+/gi);
  return m ? [...new Set(m)] : [];
}

export function mapEchoRowToFeedItem(
  echo: SupabaseEchoRow,
  author: SupabaseProfileRow | undefined,
  likedSet: Set<string>,
  bookmarkedSet: Set<string>
): FeedItem {
  const username = author?.username ?? 'unknown';
  return {
    id: echo.id,
    userId: echo.author_id,
    username,
    displayName: author?.display_name || username,
    avatarColor: author?.avatar_color || '#3B82F6',
    isVerified: author?.is_verified ?? false,
    prompt: echo.prompt,
    response: echo.response,
    likes: echo.likes_count ?? 0,
    isLiked: likedSet.has(echo.id),
    isBookmarked: bookmarkedSet.has(echo.id),
    isReposted: false,
    repostCount: echo.repost_count ?? 0,
    commentCount: echo.comment_count ?? 0,
    viewCount: echo.view_count ?? 0,
    hashtags: extractHashtags(`${echo.prompt} ${echo.response}`),
    createdAt: echo.created_at,
  };
}
