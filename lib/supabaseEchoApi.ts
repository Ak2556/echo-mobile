import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { FeedItem, Comment } from '../types';
import {
  mapEchoRowToFeedItem,
  SupabaseEchoRow,
  SupabaseProfileRow,
} from './mapSupabaseEcho';

// ─── Storage helpers ──────────────────────────────────────────────────────────

export type LocalImageUpload = {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
};

export type LocalVideoUpload = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

type UploadableImage = string | LocalImageUpload;
type UploadableVideo = string | LocalVideoUpload;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/^data:[^;]+;base64,/, '').replace(/[\r\n=]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (let i = 0; i < clean.length; i++) {
    const value = chars.indexOf(clean[i]);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >> bits) & 0xff;
    }
  }

  return bytes.slice(0, index).buffer;
}

function imageExtension(image: UploadableImage): string {
  if (typeof image !== 'string') {
    const mimeExt = image.mimeType?.split('/')[1]?.toLowerCase();
    if (mimeExt) return mimeExt === 'jpeg' ? 'jpg' : mimeExt;
    const fileExt = image.fileName?.split('.').pop()?.toLowerCase();
    if (fileExt) return fileExt;
  }

  const uri = typeof image === 'string' ? image : image.uri;
  return uri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
}

function imageContentType(image: UploadableImage): string {
  if (typeof image !== 'string' && image.mimeType) return image.mimeType;
  const ext = imageExtension(image);
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return 'image/jpeg';
}

async function imageUploadBody(image: UploadableImage): Promise<Blob | ArrayBuffer> {
  const uri = typeof image === 'string' ? image : image.uri;
  if (!/^https?:\/\//i.test(uri)) {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64ToArrayBuffer(base64);
  }

  const response = await fetch(uri);
  return response.blob();
}

async function uploadLocalFileWithSignedUrl(
  uri: string,
  path: string,
  contentType: string
): Promise<void> {
  const { data: signed, error: signedError } = await supabase.storage
    .from('echo-media')
    .createSignedUploadUrl(path);
  if (signedError) throw signedError;

  const result = await FileSystem.uploadAsync(signed.signedUrl, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'content-type': contentType,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    if (result.status === 413 || /payload too large|maximum allowed size/i.test(result.body)) {
      throw new Error('This file is larger than your Supabase project Storage limit. Raise Storage > Settings > Global file size limit, then try again.');
    }
    throw new Error(result.body || `Media upload failed (${result.status})`);
  }
}

function videoExtension(video: UploadableVideo): string {
  if (typeof video !== 'string') {
    const mimeExt = video.mimeType?.split('/')[1]?.toLowerCase();
    if (mimeExt) return mimeExt === 'quicktime' ? 'mov' : mimeExt;
    const fileExt = video.fileName?.split('.').pop()?.toLowerCase();
    if (fileExt) return fileExt;
  }

  const uri = typeof video === 'string' ? video : video.uri;
  return uri.split('?')[0].split('.').pop()?.toLowerCase() || 'mp4';
}

function videoContentType(video: UploadableVideo): string {
  if (typeof video !== 'string' && video.mimeType) return video.mimeType;
  const ext = videoExtension(video);
  if (ext === 'mov' || ext === 'qt') return 'video/quicktime';
  if (ext === 'm4v') return 'video/x-m4v';
  if (ext === 'webm') return 'video/webm';
  return 'video/mp4';
}

/**
 * Upload a local image URI to the `avatars` bucket.
 * Uses the authenticated session UID as the folder name (required by RLS).
 * Returns the public URL of the uploaded file.
 */
export async function uploadAvatar(image: UploadableImage): Promise<string> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');

  const ext = imageExtension(image);
  const path = `${uid}/avatar.${ext}`;

  const body = await imageUploadBody(image);
  const contentType = imageContentType(image);

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, body, { upsert: true, contentType });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload up to 4 local image URIs to the `echo-media` bucket.
 * Uses the authenticated session UID as the folder name (required by RLS).
 * Returns an array of public URLs in the same order.
 */
export async function uploadEchoImages(images: UploadableImage[]): Promise<string[]> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');

  const urls: string[] = [];
  for (let i = 0; i < Math.min(images.length, 4); i++) {
    const image = images[i];
    const ext = imageExtension(image);
    const path = `${uid}/${Date.now()}_${i}.${ext}`;

    const contentType = imageContentType(image);
    const uri = typeof image === 'string' ? image : image.uri;

    if (/^https?:\/\//i.test(uri)) {
      const body = await imageUploadBody(image);
      const { error } = await supabase.storage
        .from('echo-media')
        .upload(path, body, { contentType });
      if (error) throw error;
    } else {
      await uploadLocalFileWithSignedUrl(uri, path, contentType);
    }

    const { data } = supabase.storage.from('echo-media').getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

/**
 * Upload a local video URI to the `echo-media` bucket.
 * Uses a signed upload URL plus native filesystem upload so large videos do not
 * have to be loaded into JS memory.
 */
export async function uploadEchoVideo(video: UploadableVideo): Promise<string> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');

  const uri = typeof video === 'string' ? video : video.uri;
  const ext = videoExtension(video);
  const path = `${uid}/${Date.now()}_video.${ext}`;
  const contentType = videoContentType(video);

  await uploadLocalFileWithSignedUrl(uri, path, contentType);

  const { data } = supabase.storage.from('echo-media').getPublicUrl(path);
  return data.publicUrl;
}

// ─── Profile select helper ────────────────────────────────────────────────────

const PROFILE_SELECT = 'id, username, display_name, bio, avatar_color, avatar_url, is_verified, created_at, follower_count';
const ECHO_SELECT = 'id, author_id, title, prompt, response, likes_count, comment_count, repost_count, view_count, created_at, media_urls, quoted_echo_id';

export async function getSessionUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function fetchRemoteBookmarkedFeed(): Promise<FeedItem[]> {
  const uid = await getSessionUserId();
  if (!uid) return [];
  const { data: bms, error: e0 } = await supabase
    .from('echo_bookmarks')
    .select('echo_id')
    .eq('user_id', uid);
  if (e0) throw e0;
  const ids = (bms || []).map((r: { echo_id: string }) => r.echo_id);
  if (!ids.length) return [];

  const { data: echoes, error: e1 } = await supabase
    .from('public_echoes')
    .select(ECHO_SELECT)
    .in('id', ids);
  if (e1) throw e1;
  const rows = (echoes || []) as SupabaseEchoRow[];
  if (!rows.length) return [];

  const authorIds = [...new Set(rows.map(r => r.author_id))];
  const { data: profiles, error: e2 } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('id', authorIds);
  if (e2) throw e2;
  const profileById = new Map((profiles as SupabaseProfileRow[] || []).map(p => [p.id, p]));

  const [{ data: likeRows }, { data: repostRows }] = await Promise.all([
    supabase.from('echo_likes').select('echo_id').eq('user_id', uid),
    supabase.from('echo_reposts').select('echo_id').eq('user_id', uid).in('echo_id', ids),
  ]);
  const liked = new Set((likeRows || []).map((r: { echo_id: string }) => r.echo_id));
  const bookmarked = new Set(ids);
  const reposted = new Set((repostRows || []).map((r: { echo_id: string }) => r.echo_id));

  return rows.map(echo =>
    mapEchoRowToFeedItem(echo, profileById.get(echo.author_id), liked, bookmarked, reposted)
  );
}

// ─── Ranked feed (server-scored) ─────────────────────────────────────────────

// Row shape returned by the get_ranked_feed RPC (echo + profile joined).
type RankedFeedRow = SupabaseEchoRow & SupabaseProfileRow & { rank_score: number };

export type RankedFeedCursor = { score: number; id: string } | undefined;

export async function fetchRankedFeed(options: {
  limit?: number;
  gravity?: number;
  cursor?: RankedFeedCursor;
  followingOnly?: boolean;
} = {}): Promise<FeedItem[]> {
  const uid = await getSessionUserId();

  const { data, error } = await supabase.rpc('get_ranked_feed', {
    p_user_id: uid ?? null,
    p_limit: options.limit ?? 50,
    p_gravity: options.gravity ?? 1.8,
    p_cursor_score: options.cursor?.score ?? null,
    p_cursor_id: options.cursor?.id ?? null,
    p_following_only: options.followingOnly ?? false,
  });

  if (error) throw error;

  const rows = (data ?? []) as RankedFeedRow[];
  if (rows.length === 0) return [];

  // Profile data is already joined — build the Map directly.
  const profileById = new Map<string, SupabaseProfileRow>(
    rows.map(r => [r.author_id, {
      id: r.author_id,
      username: r.username,
      display_name: r.display_name,
      bio: r.bio,
      avatar_color: r.avatar_color,
      avatar_url: r.avatar_url,
      is_verified: r.is_verified,
      created_at: '',
      follower_count: r.follower_count,
    }])
  );

  // Fetch per-user engagement state in parallel (3 reads, all filtered to current page).
  let liked = new Set<string>();
  let bookmarked = new Set<string>();
  let reposted = new Set<string>();

  if (uid) {
    const ids = rows.map(r => r.id);
    const [{ data: likeRows }, { data: bmRows }, { data: repostRows }] = await Promise.all([
      supabase.from('echo_likes').select('echo_id').eq('user_id', uid),
      supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid),
      supabase.from('echo_reposts').select('echo_id').eq('user_id', uid).in('echo_id', ids),
    ]);
    liked = new Set((likeRows ?? []).map((r: { echo_id: string }) => r.echo_id));
    bookmarked = new Set((bmRows ?? []).map((r: { echo_id: string }) => r.echo_id));
    reposted = new Set((repostRows ?? []).map((r: { echo_id: string }) => r.echo_id));
  }

  return rows.map(row =>
    mapEchoRowToFeedItem(
      { ...row, rank_score: row.rank_score } as SupabaseEchoRow,
      profileById.get(row.author_id),
      liked, bookmarked, reposted
    )
  );
}

export async function fetchRemoteFeed(
  options: { limit?: number; cursor?: string } = {}
): Promise<FeedItem[]> {
  const uid = await getSessionUserId();

  let query = supabase
    .from('public_echoes')
    .select(ECHO_SELECT)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50);

  if (options.cursor) {
    query = query.lt('created_at', options.cursor);
  }

  const { data: echoes, error: e1 } = await query;

  if (e1) throw e1;
  const rows = (echoes || []) as SupabaseEchoRow[];
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map(r => r.author_id))];
  const { data: profiles, error: e2 } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('id', authorIds);

  if (e2) throw e2;
  const profileById = new Map((profiles as SupabaseProfileRow[] || []).map(p => [p.id, p]));

  let liked = new Set<string>();
  let bookmarked = new Set<string>();
  if (uid) {
    const [{ data: likeRows }, { data: bmRows }, { data: repostRows }] = await Promise.all([
      supabase.from('echo_likes').select('echo_id').eq('user_id', uid),
      supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid),
      supabase.from('echo_reposts').select('echo_id').eq('user_id', uid),
    ]);
    liked = new Set((likeRows || []).map((r: { echo_id: string }) => r.echo_id));
    bookmarked = new Set((bmRows || []).map((r: { echo_id: string }) => r.echo_id));
    const reposted = new Set((repostRows || []).map((r: { echo_id: string }) => r.echo_id));
    return rows.map(echo =>
      mapEchoRowToFeedItem(echo, profileById.get(echo.author_id), liked, bookmarked, reposted)
    );
  }

  const emptyReposted = new Set<string>();
  return rows.map(echo =>
    mapEchoRowToFeedItem(echo, profileById.get(echo.author_id), liked, bookmarked, emptyReposted)
  );
}

export async function insertRemoteEcho(params: {
  authorId: string;
  prompt: string;
  response: string;
  title?: string;
  mediaUrls?: string[];
  quotedEchoId?: string;
}): Promise<SupabaseEchoRow> {
  const title =
    params.title?.trim() ||
    (params.prompt.trim().slice(0, 80) + (params.prompt.length > 80 ? '…' : ''));
  const { data, error } = await supabase
    .from('public_echoes')
    .insert({
      author_id: params.authorId,
      title,
      prompt: params.prompt,
      response: params.response,
      ...(params.mediaUrls?.length ? { media_urls: params.mediaUrls } : {}),
      ...(params.quotedEchoId ? { quoted_echo_id: params.quotedEchoId } : {}),
    })
    .select(ECHO_SELECT)
    .single();
  if (error) throw error;
  return data as SupabaseEchoRow;
}

export async function setRemoteLike(echoId: string, like: boolean): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (like) {
    const { error } = await supabase.from('echo_likes').insert({ echo_id: echoId, user_id: uid });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    const { error } = await supabase
      .from('echo_likes')
      .delete()
      .eq('echo_id', echoId)
      .eq('user_id', uid);
    if (error) throw error;
  }
}

export async function setRemoteBookmark(echoId: string, bookmark: boolean): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (bookmark) {
    const { error } = await supabase.from('echo_bookmarks').insert({ echo_id: echoId, user_id: uid });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    const { error } = await supabase
      .from('echo_bookmarks')
      .delete()
      .eq('echo_id', echoId)
      .eq('user_id', uid);
    if (error) throw error;
  }
}

export async function setRemoteRepost(echoId: string, repost: boolean): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (repost) {
    const { error } = await supabase.from('echo_reposts').insert({ echo_id: echoId, user_id: uid });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    const { error } = await supabase
      .from('echo_reposts')
      .delete()
      .eq('echo_id', echoId)
      .eq('user_id', uid);
    if (error) throw error;
  }
}

/** Records one deduplicated view per authenticated user per echo (PK echo_id,user_id). Ignores duplicates. */
export async function recordRemoteEchoView(echoId: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) return;
  const { error } = await supabase.from('echo_views').insert({ echo_id: echoId, user_id: uid });
  if (!error) return;
  const code = (error as { code?: string }).code;
  if (code === '23505') return;
  if (error.message?.includes('duplicate')) return;
  throw error;
}

export async function fetchRemoteComments(echoId: string): Promise<Comment[]> {
  const { data: rows, error } = await supabase
    .from('echo_comments')
    .select('id, echo_id, author_id, content, likes_count, created_at, parent_comment_id')
    .eq('echo_id', echoId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const list = rows || [];
  if (list.length === 0) return [];

  const commentIds = list.map((r: { id: string }) => r.id);
  const authorIds = [...new Set(list.map((r: { author_id: string }) => r.author_id))];

  // Fetch profiles and current user's likes in parallel
  const uid = await getSessionUserId();
  const [profilesRes, likesRes, repliesRes] = await Promise.all([
    supabase.from('profiles').select(PROFILE_SELECT).in('id', authorIds),
    uid
      ? supabase.from('comment_likes').select('comment_id').in('comment_id', commentIds).eq('user_id', uid)
      : Promise.resolve({ data: [] }),
    supabase
      .from('echo_comments')
      .select('parent_comment_id')
      .in('parent_comment_id', commentIds),
  ]);

  const profileById = new Map((profilesRes.data as SupabaseProfileRow[] || []).map(p => [p.id, p]));
  const likedSet = new Set<string>((likesRes.data || []).map((r: { comment_id: string }) => r.comment_id));
  // Count replies per parent
  const replyCountMap = new Map<string, number>();
  for (const r of (repliesRes.data || []) as { parent_comment_id: string }[]) {
    replyCountMap.set(r.parent_comment_id, (replyCountMap.get(r.parent_comment_id) ?? 0) + 1);
  }

  return list.map((r: {
    id: string;
    echo_id: string;
    author_id: string;
    content: string;
    likes_count: number;
    created_at: string;
    parent_comment_id: string | null;
  }) => {
    const p = profileById.get(r.author_id);
    const username = p?.username ?? 'user';
    return {
      id: r.id,
      echoId: r.echo_id,
      userId: r.author_id,
      username,
      displayName: p?.display_name || username,
      avatarColor: p?.avatar_color || '#3B82F6',
      avatarUrl: p?.avatar_url ?? undefined,
      isVerified: p?.is_verified ?? false,
      content: r.content,
      likes: r.likes_count ?? 0,
      isLiked: likedSet.has(r.id),
      replyCount: replyCountMap.get(r.id) ?? 0,
      parentId: r.parent_comment_id ?? undefined,
      createdAt: r.created_at,
    };
  });
}

export async function setRemoteCommentLike(commentId: string, like: boolean): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (like) {
    await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: uid });
  } else {
    await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', uid);
  }
}

export async function submitRemoteReport(params: {
  targetType: 'echo' | 'user' | 'comment';
  targetId: string;
  reason: string;
  details?: string;
}): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('reports').insert({
    reporter_id: uid,
    target_type: params.targetType,
    target_id: params.targetId,
    reason: params.reason,
    details: params.details ?? null,
  });
  if (error) throw error;
}

export async function insertRemoteComment(echoId: string, content: string, parentCommentId?: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('echo_comments').insert({
    echo_id: echoId,
    author_id: uid,
    content,
    ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
  });
  if (error) throw error;
}

export async function fetchRemoteProfile(userId: string): Promise<SupabaseProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as SupabaseProfileRow | null;
}

export async function fetchRemoteEchoesByAuthor(authorId: string): Promise<FeedItem[]> {
  const { data: echoes, error } = await supabase
    .from('public_echoes')
    .select(ECHO_SELECT)
    .eq('author_id', authorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (echoes || []) as SupabaseEchoRow[];
  if (rows.length === 0) return [];

  const { data: profile } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', authorId)
    .maybeSingle();
  const author = profile as SupabaseProfileRow | null | undefined;

  const uid = await getSessionUserId();
  let liked = new Set<string>();
  let bookmarked = new Set<string>();
  let reposted = new Set<string>();
  if (uid && rows.length) {
    const ids = rows.map(r => r.id);
    const [{ data: likeRows }, { data: bmRows }, { data: repostRows }] = await Promise.all([
      supabase.from('echo_likes').select('echo_id').eq('user_id', uid).in('echo_id', ids),
      supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid).in('echo_id', ids),
      supabase.from('echo_reposts').select('echo_id').eq('user_id', uid).in('echo_id', ids),
    ]);
    liked = new Set((likeRows || []).map((r: { echo_id: string }) => r.echo_id));
    bookmarked = new Set((bmRows || []).map((r: { echo_id: string }) => r.echo_id));
    reposted = new Set((repostRows || []).map((r: { echo_id: string }) => r.echo_id));
  }

  return rows.map(echo =>
    mapEchoRowToFeedItem(echo, author || undefined, liked, bookmarked, reposted)
  );
}

export async function isRemoteFollowing(targetUserId: string): Promise<boolean> {
  const uid = await getSessionUserId();
  if (!uid) return false;
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', uid)
    .eq('following_id', targetUserId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function setRemoteFollow(targetUserId: string, follow: boolean): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (follow) {
    const { error } = await supabase.from('follows').insert({
      follower_id: uid,
      following_id: targetUserId,
    });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', uid)
      .eq('following_id', targetUserId);
    if (error) throw error;
  }
}

export async function fetchRemoteFollowersCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchRemoteFollowingCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchRemoteFollowers(userId: string): Promise<SupabaseProfileRow[]> {
  const { data: rows, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('following_id', userId);
  if (error) throw error;
  const ids = (rows || []).map((r: { follower_id: string }) => r.follower_id);
  if (!ids.length) return [];
  const { data: profiles, error: e2 } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('id', ids);
  if (e2) throw e2;
  return (profiles || []) as SupabaseProfileRow[];
}

export async function fetchRemoteFollowingProfiles(userId: string): Promise<SupabaseProfileRow[]> {
  const { data: rows, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);
  if (error) throw error;
  const ids = (rows || []).map((r: { following_id: string }) => r.following_id);
  if (!ids.length) return [];
  const { data: profiles, error: e2 } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('id', ids);
  if (e2) throw e2;
  return (profiles || []) as SupabaseProfileRow[];
}

export async function updateRemoteProfile(updates: {
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_color?: string;
  avatar_url?: string;
}): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('profiles').update(updates).eq('id', uid);
  if (error) throw error;
}

export async function upsertRemoteProfileOnSignIn(username: string, displayName: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('profiles').upsert(
    {
      id: uid,
      username: username.trim().toLowerCase(),
      display_name: displayName.trim() || username.trim(),
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function fetchRemoteNotifications(): Promise<import('../types').Notification[]> {
  const uid = await getSessionUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, actor_id, target_kind, target_id, preview, read_at, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const actorIds = [...new Set(rows.map((r: { actor_id: string }) => r.actor_id))];
  const { data: profiles } = await supabase.from('profiles').select(PROFILE_SELECT).in('id', actorIds);
  const profileById = new Map((profiles as SupabaseProfileRow[] ?? []).map(p => [p.id, p]));

  return rows.map((r: {
    id: string; type: string; actor_id: string; target_kind: string | null;
    target_id: string | null; preview: string | null; read_at: string | null; created_at: string;
  }) => {
    const actor = profileById.get(r.actor_id);
    return {
      id: r.id,
      type: r.type as import('../types').Notification['type'],
      fromUserId: r.actor_id,
      fromUsername: actor?.username ?? 'user',
      fromDisplayName: actor?.display_name || actor?.username || 'User',
      fromAvatarColor: actor?.avatar_color || '#3B82F6',
      fromAvatarUrl: actor?.avatar_url ?? undefined,
      targetId: r.target_id ?? undefined,
      targetPreview: r.preview ?? undefined,
      isRead: r.read_at !== null,
      createdAt: r.created_at,
    };
  });
}

export async function markRemoteNotificationRead(notificationId: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) return;
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', uid);
}

export async function markAllRemoteNotificationsRead(): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) return;
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', uid)
    .is('read_at', null);
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function searchRemoteProfiles(query: string): Promise<import('../types').User[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(20);
  if (error) throw error;
  return (data as SupabaseProfileRow[] ?? []).map(p => ({
    id: p.id,
    username: p.username,
    displayName: p.display_name || p.username,
    avatarColor: p.avatar_color || '#3B82F6',
    avatarUrl: p.avatar_url ?? undefined,
    bio: p.bio ?? '',
    isVerified: p.is_verified,
    followerCount: 0,
    followingCount: 0,
    echoCount: 0,
    createdAt: p.created_at,
  }));
}

export async function searchRemoteEchoes(query: string): Promise<import('../types').FeedItem[]> {
  const q = query.trim();
  if (!q) return [];
  // Strip leading # for hashtag searches
  const bare = q.startsWith('#') ? q.slice(1) : q;
  const { data: rows, error } = await supabase
    .from('public_echoes')
    .select(ECHO_SELECT)
    .or(`title.ilike.%${bare}%,prompt.ilike.%${bare}%,response.ilike.%${bare}%`)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  const list = rows as SupabaseEchoRow[] ?? [];
  if (list.length === 0) return [];

  const authorIds = [...new Set(list.map(r => r.author_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('id', authorIds);
  const profileById = new Map((profiles as SupabaseProfileRow[] ?? []).map(p => [p.id, p]));

  const uid = await getSessionUserId();
  const echoIds = list.map(r => r.id);
  const [likesRes, bookmarksRes, repostsRes] = await Promise.all([
    uid ? supabase.from('echo_likes').select('echo_id').in('echo_id', echoIds).eq('user_id', uid) : Promise.resolve({ data: [] }),
    uid ? supabase.from('echo_bookmarks').select('echo_id').in('echo_id', echoIds).eq('user_id', uid) : Promise.resolve({ data: [] }),
    uid ? supabase.from('echo_reposts').select('echo_id').in('echo_id', echoIds).eq('user_id', uid) : Promise.resolve({ data: [] }),
  ]);
  const likedSet = new Set<string>((likesRes.data ?? []).map((r: { echo_id: string }) => r.echo_id));
  const bookmarkedSet = new Set<string>((bookmarksRes.data ?? []).map((r: { echo_id: string }) => r.echo_id));
  const repostedSet = new Set<string>((repostsRes.data ?? []).map((r: { echo_id: string }) => r.echo_id));

  return list.map(r => mapEchoRowToFeedItem(r, profileById.get(r.author_id), likedSet, bookmarkedSet, repostedSet));
}

// ── Edit Echo ─────────────────────────────────────────────────────────────────

export async function updateRemoteEcho(
  echoId: string,
  updates: { title?: string; prompt?: string; response?: string; media_urls?: string[] }
): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase
    .from('public_echoes')
    .update(updates)
    .eq('id', echoId)
    .eq('author_id', uid);
  if (error) throw error;
}

// ── Direct Messages ──────────────────────────────────────────

export interface RemoteConversation {
  id: string;
  otherUserId: string;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarColor: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageKind: string;
  unreadCount: number;
}

export interface RemoteMessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
}

export interface RemoteDirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  kind: 'text' | 'echo' | 'image' | 'voice' | 'link';
  createdAt: string;
  readAt: string | null;
  deletedAt: string | null;
  sharedEchoId: string | null;
  mediaUrl: string | null;
  reactions: RemoteMessageReaction[];
}

/** Upsert a conversation (order user_a < user_b per DB check) and insert a message.
 *  The DB trigger handles updating last_message_at / last_message_text. */
export async function sendRemoteDM(
  recipientId: string,
  content: string,
): Promise<{ conversationId: string }> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');

  const userA = uid < recipientId ? uid : recipientId;
  const userB = uid < recipientId ? recipientId : uid;

  const { data: conv, error: convErr } = await supabase
    .from('dm_conversations')
    .upsert({ user_a: userA, user_b: userB }, { onConflict: 'user_a,user_b' })
    .select('id')
    .single();
  if (convErr) throw convErr;

  const { error: msgErr } = await supabase
    .from('direct_messages')
    .insert({ conversation_id: conv.id, sender_id: uid, kind: 'text', text: content });
  if (msgErr) throw msgErr;

  return { conversationId: conv.id };
}

/** Fetch all conversations via RPC (correct last message + real unread count). */
export async function fetchRemoteConversations(): Promise<RemoteConversation[]> {
  const uid = await getSessionUserId();
  if (!uid) return [];

  const { data, error } = await supabase.rpc('get_dm_conversations', { p_user_id: uid });
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: r.id as string,
    otherUserId: r.other_user_id as string,
    otherUsername: (r.other_username as string | null) ?? 'unknown',
    otherDisplayName: (r.other_display_name as string | null) ?? (r.other_username as string | null) ?? 'User',
    otherAvatarColor: (r.other_avatar_color as string | null) ?? '#6366F1',
    lastMessage: (r.last_message_text as string | null) ?? null,
    lastMessageAt: (r.last_message_at as string | null) ?? null,
    lastMessageKind: (r.last_message_kind as string | null) ?? 'text',
    unreadCount: Number(r.unread_count ?? 0),
  }));
}

/** Fetch a single conversation by UUID (used when local store doesn't have it). */
export async function fetchConversationById(conversationId: string): Promise<RemoteConversation | null> {
  const uid = await getSessionUserId();
  if (!uid) return null;

  const { data: conv } = await supabase
    .from('dm_conversations')
    .select('id, user_a, user_b, last_message_at, last_message_text, last_message_kind')
    .eq('id', conversationId)
    .single();
  if (!conv) return null;

  const otherId: string = (conv.user_a as string) === uid ? (conv.user_b as string) : (conv.user_a as string);
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_color')
    .eq('id', otherId)
    .single();

  return {
    id: conv.id as string,
    otherUserId: otherId,
    otherUsername: (profile?.username as string | null) ?? 'unknown',
    otherDisplayName: (profile?.display_name as string | null) ?? (profile?.username as string | null) ?? 'User',
    otherAvatarColor: (profile?.avatar_color as string | null) ?? '#6366F1',
    lastMessage: (conv.last_message_text as string | null) ?? null,
    lastMessageAt: (conv.last_message_at as string | null) ?? null,
    lastMessageKind: (conv.last_message_kind as string | null) ?? 'text',
    unreadCount: 0,
  };
}

/** Mark all unread incoming messages in a conversation as read. */
export async function markMessagesRead(conversationId: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) return;
  await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', uid)
    .is('read_at', null);
}

/** Soft-delete a message (sender only). */
export async function deleteRemoteMessage(messageId: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase
    .from('direct_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('sender_id', uid);
  if (error) throw error;
}

/** Add an emoji reaction (idempotent upsert). */
export async function addMessageReaction(messageId: string, emoji: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase
    .from('message_reactions')
    .upsert({ message_id: messageId, user_id: uid, emoji }, { onConflict: 'message_id,user_id,emoji' });
  if (error) throw error;
}

/** Remove an emoji reaction. */
export async function removeMessageReaction(messageId: string, emoji: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', uid)
    .eq('emoji', emoji);
  if (error) throw error;
}

/** Fetch messages for a conversation (oldest-first, paginated by cursor). */
export async function fetchRemoteMessages(
  conversationId: string,
  limit = 40,
  cursor?: string,
): Promise<RemoteDirectMessage[]> {
  let q = supabase
    .from('direct_messages')
    .select(`
      id, conversation_id, sender_id, text, kind,
      created_at, read_at, deleted_at, shared_echo_id, media_url,
      reactions:message_reactions(id, user_id, emoji)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).reverse().map(m => ({
    id: m.id as string,
    conversationId: m.conversation_id as string,
    senderId: m.sender_id as string,
    content: (m.text as string | null) ?? null,
    kind: (m.kind as RemoteDirectMessage['kind']) ?? 'text',
    createdAt: m.created_at as string,
    readAt: (m.read_at as string | null) ?? null,
    deletedAt: (m.deleted_at as string | null) ?? null,
    sharedEchoId: (m.shared_echo_id as string | null) ?? null,
    mediaUrl: (m.media_url as string | null) ?? null,
    reactions: ((m.reactions as Record<string, unknown>[] | null) ?? []).map(r => ({
      id: r.id as string,
      messageId: m.id as string,
      userId: r.user_id as string,
      emoji: r.emoji as string,
    })),
  }));
}

// ── Suggested Users ──────────────────────────────────────────

export async function fetchSuggestedUsers(): Promise<import('../types').User[]> {
  const uid = await getSessionUserId();
  if (!uid) return [];

  // Fetch users the current user is already following
  const { data: followingRows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', uid);
  const alreadyFollowing = new Set((followingRows ?? []).map((r: { following_id: string }) => r.following_id));
  alreadyFollowing.add(uid); // Exclude self

  // Fetch profiles not already followed, ordered by follower count desc
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_color, bio, follower_count')
    .not('id', 'in', `(${Array.from(alreadyFollowing).join(',')})`)
    .order('follower_count', { ascending: false })
    .limit(8);

  if (error) throw error;

  return (data ?? []).map((p: any) => ({
    id: p.id,
    username: p.username ?? 'unknown',
    displayName: p.display_name ?? p.username ?? 'User',
    avatarColor: p.avatar_color ?? '#6366F1',
    bio: p.bio ?? '',
    followerCount: p.follower_count ?? 0,
    followingCount: 0,
    isVerified: false,
    echoCount: 0,
    createdAt: '',
  }));
}

// ── Block / Mute ─────────────────────────────────────────────

export async function fetchRemoteBlocks(): Promise<string[]> {
  const uid = await getSessionUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', uid);
  if (error) throw error;
  return (data ?? []).map((r: { blocked_id: string }) => r.blocked_id);
}

export async function fetchRemoteMutes(): Promise<string[]> {
  const uid = await getSessionUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('user_mutes')
    .select('muted_id')
    .eq('muter_id', uid);
  if (error) throw error;
  return (data ?? []).map((r: { muted_id: string }) => r.muted_id);
}

export async function setRemoteBlock(targetUserId: string, block: boolean): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (block) {
    const { error } = await supabase
      .from('user_blocks')
      .upsert({ blocker_id: uid, blocked_id: targetUserId }, { onConflict: 'blocker_id,blocked_id' });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', uid)
      .eq('blocked_id', targetUserId);
    if (error) throw error;
  }
}

export async function setRemoteMute(targetUserId: string, mute: boolean): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (mute) {
    const { error } = await supabase
      .from('user_mutes')
      .upsert({ muter_id: uid, muted_id: targetUserId }, { onConflict: 'muter_id,muted_id' });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_mutes')
      .delete()
      .eq('muter_id', uid)
      .eq('muted_id', targetUserId);
    if (error) throw error;
  }
}
