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

const PROFILE_SELECT = 'id, username, display_name, bio, avatar_color, avatar_url, is_verified, created_at';
const ECHO_SELECT = 'id, author_id, title, prompt, response, likes_count, comment_count, repost_count, view_count, created_at, media_urls';

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

export async function fetchRemoteFeed(): Promise<FeedItem[]> {
  const uid = await getSessionUserId();

  const { data: echoes, error: e1 } = await supabase
    .from('public_echoes')
    .select(ECHO_SELECT)
    .order('created_at', { ascending: false });

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

  const authorIds = [...new Set(list.map((r: { author_id: string }) => r.author_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('id', authorIds);
  const profileById = new Map((profiles as SupabaseProfileRow[] || []).map(p => [p.id, p]));

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
      isLiked: false,
      replyCount: 0,
      parentId: r.parent_comment_id ?? undefined,
      createdAt: r.created_at,
    };
  });
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
