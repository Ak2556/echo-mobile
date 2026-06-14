import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { FeedItem, Comment, EvolutionGroup, RemixTreeNode } from '../types';
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
  fileSize?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
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
      'cache-control': 'max-age=31536000',
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
    const mime = video.mimeType?.toLowerCase();
    if (mime === 'video/mp4') return 'mp4';
    if (mime === 'video/quicktime') return 'mov';
    if (mime === 'video/x-m4v') return 'm4v';
    if (mime === 'video/webm') return 'webm';
    const mimeExt = mime?.split('/')[1]?.toLowerCase();
    if (mimeExt) return mimeExt === 'quicktime' ? 'mov' : mimeExt.replace(/^x-/, '');
    const fileExt = video.fileName?.split('.').pop()?.toLowerCase();
    if (fileExt) return fileExt.replace(/^x-/, '');
  }

  const uri = typeof video === 'string' ? video : video.uri;
  return (uri.split('?')[0].split('.').pop()?.toLowerCase() || 'mp4').replace(/^x-/, '');
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

  if (/^https?:\/\//i.test(uri)) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`Could not fetch video (${response.status})`);
    const { error } = await supabase.storage
      .from('echo-media')
      .upload(path, await response.blob(), { contentType, cacheControl: '31536000' });
    if (error) throw error;
  } else {
    await uploadLocalFileWithSignedUrl(uri, path, contentType);
  }

  const { data } = supabase.storage.from('echo-media').getPublicUrl(path);
  return data.publicUrl;
}

// ─── Profile select helper ────────────────────────────────────────────────────

const PROFILE_SELECT = 'id, username, display_name, bio, avatar_color, avatar_url, is_verified, created_at, follower_count, mood, mood_expires_at, pronouns, pinned_echo_id';
const ECHO_SELECT = 'id, author_id, title, prompt, response, likes_count, comment_count, repost_count, view_count, created_at, media_urls, quoted_echo_id, parent_echo_id, remix_root_id, remix_count, thoughtfulness_score, mind_blown_count, taking_notes_count, agree_count, disagree_count, co_author_id, co_author_response, post_type';

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
    // moderation gate: mirror get_ranked_feed / get_semantic_feed so the
    // chronological fallback never surfaces unmoderated content.
    .eq('check_content', true)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50);

  if (options.cursor) {
    query = query.lt('created_at', options.cursor);
  }

  const { data: echoes, error: e1 } = await query;

  if (e1) throw e1;
  const rows = (echoes || []) as SupabaseEchoRow[];
  if (rows.length === 0) return [];

  const authorIds = [
    ...new Set([
      ...rows.map(r => r.author_id),
      ...rows.map(r => r.co_author_id).filter(Boolean) as string[],
    ]),
  ];
  const { data: profiles, error: e2 } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('id', authorIds);

  if (e2) throw e2;
  const profileById = new Map((profiles as SupabaseProfileRow[] || []).map(p => [p.id, p]));

  let liked = new Set<string>();
  let bookmarked = new Set<string>();
  if (uid) {
    const [likesRes, bmRes, repostRes, reactionsRes] = await Promise.allSettled([
      supabase.from('echo_likes').select('echo_id').eq('user_id', uid),
      supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid),
      supabase.from('echo_reposts').select('echo_id').eq('user_id', uid),
      // Knowledge reactions the current viewer gave to anything in this feed.
      supabase.from('echo_reactions').select('echo_id, reaction').eq('user_id', uid).in('echo_id', rows.map(r => r.id)),
    ]);
    liked = new Set((likesRes.status === 'fulfilled' ? likesRes.value.data ?? [] : []).map((r: { echo_id: string }) => r.echo_id));
    bookmarked = new Set((bmRes.status === 'fulfilled' ? bmRes.value.data ?? [] : []).map((r: { echo_id: string }) => r.echo_id));
    const reposted = new Set((repostRes.status === 'fulfilled' ? repostRes.value.data ?? [] : []).map((r: { echo_id: string }) => r.echo_id));
    const reactionMap = new Map<string, import('../types').EchoReaction[]>();
    if (reactionsRes.status === 'fulfilled') {
      for (const r of reactionsRes.value.data ?? []) {
        const list = reactionMap.get(r.echo_id) ?? [];
        list.push(r.reaction as import('../types').EchoReaction);
        reactionMap.set(r.echo_id, list);
      }
    }
    return rows.map(echo =>
      mapEchoRowToFeedItem(echo, profileById.get(echo.author_id), liked, bookmarked, reposted, reactionMap.get(echo.id), echo.co_author_id ? profileById.get(echo.co_author_id) : undefined),
    );
  }

  const emptyReposted = new Set<string>();
  return rows.map(echo =>
    mapEchoRowToFeedItem(echo, profileById.get(echo.author_id), liked, bookmarked, emptyReposted, undefined, echo.co_author_id ? profileById.get(echo.co_author_id) : undefined)
  );
}

export async function insertRemoteEcho(params: {
  authorId: string;
  prompt: string;
  response: string;
  title?: string;
  mediaUrls?: string[];
  quotedEchoId?: string;
  parentEchoId?: string;
  sourceConversationId?: string;
  conversationSnapshot?: { role: 'user' | 'assistant'; content: string }[];
  coAuthorId?: string;
  coAuthorResponse?: string;
  postType?: string;
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
      ...(params.postType && params.postType !== 'text' ? { post_type: params.postType } : {}),
      ...(params.mediaUrls?.length ? { media_urls: params.mediaUrls } : {}),
      ...(params.quotedEchoId ? { quoted_echo_id: params.quotedEchoId } : {}),
      ...(params.parentEchoId ? { parent_echo_id: params.parentEchoId } : {}),
      ...(params.sourceConversationId ? { source_conversation_id: params.sourceConversationId } : {}),
      ...(params.conversationSnapshot?.length ? { conversation_snapshot: params.conversationSnapshot } : {}),
      ...(params.coAuthorId ? { co_author_id: params.coAuthorId } : {}),
      ...(params.coAuthorResponse?.trim() ? { co_author_response: params.coAuthorResponse.trim() } : {}),
    })
    .select(ECHO_SELECT)
    .single();
  if (error) throw error;
  const row = data as SupabaseEchoRow;
  // Fire-and-forget: ask the edge function to generate the embedding and
  // thoughtfulness score. Failure here must not block the publish flow.
  triggerEmbedEcho(row.id).catch(() => undefined);
  // Insert any @-mentions found in prompt + response. Best-effort; doesn't block.
  const usernames = parseMentions(`${params.prompt} ${params.response}`);
  if (usernames.length) {
    insertEchoMentions(row.id, usernames).catch(() => undefined);
  }
  // Gen-Z gamification: bump daily_post quest, award first_echo if we just
  // crossed the threshold. All fire-and-forget; never block the publish flow.
  bumpQuestProgress('daily_post').catch(() => undefined);
  if (usernames.length) {
    bumpQuestProgress('weekly_mention', usernames.length).catch(() => undefined);
  }
  // First-echo badge — award once; idempotent via PK on (user_id, badge_id).
  awardBadge('first_echo').catch(() => undefined);
  return row;
}

/**
 * Asks the embed-echo edge function to compute and persist the embedding +
 * thoughtfulness score for a published echo. Non-blocking; errors are swallowed
 * so the publish UX is never gated on embedding success.
 */
export async function triggerEmbedEcho(echoId: string): Promise<void> {
  try {
    await supabase.functions.invoke('embed-echo', { body: { echo_id: echoId } });
  } catch {
    // Embedding is best-effort. Reconciliation can happen via a backfill job.
  }
}

export async function fetchRemoteEchoById(echoId: string): Promise<FeedItem | null> {
  const uid = await getSessionUserId();
  const { data: echo, error } = await supabase
    .from('public_echoes')
    .select(ECHO_SELECT)
    .eq('id', echoId)
    .single();
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }
  if (!echo) return null;
  const row = echo as SupabaseEchoRow;
  const { data: profile } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', row.author_id)
    .single();
  let liked = new Set<string>();
  let bookmarked = new Set<string>();
  let reposted = new Set<string>();
  if (uid) {
    const [{ data: likeRow }, { data: bmRow }, { data: rpRow }] = await Promise.all([
      supabase.from('echo_likes').select('echo_id').eq('user_id', uid).eq('echo_id', row.id).maybeSingle(),
      supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid).eq('echo_id', row.id).maybeSingle(),
      supabase.from('echo_reposts').select('echo_id').eq('user_id', uid).eq('echo_id', row.id).maybeSingle(),
    ]);
    if (likeRow) liked = new Set([row.id]);
    if (bmRow) bookmarked = new Set([row.id]);
    if (rpRow) reposted = new Set([row.id]);
  }
  return mapEchoRowToFeedItem(row, profile as SupabaseProfileRow | undefined, liked, bookmarked, reposted);
}

/**
 * Fetches the multi-turn snapshot a published echo was forged from. Returns
 * an empty array if the echo was published before snapshots existed.
 */
export async function fetchEchoConversationSnapshot(
  echoId: string
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const { data, error } = await supabase
    .from('public_echoes')
    .select('conversation_snapshot, prompt, response')
    .eq('id', echoId)
    .single();
  if (error) throw error;
  const snapshot = (data?.conversation_snapshot as { role: 'user' | 'assistant'; content: string }[] | null) ?? null;
  if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) return snapshot;
  // Fallback: synthesize a two-message snapshot from prompt/response.
  const prompt = (data?.prompt as string | undefined) ?? '';
  const response = (data?.response as string | undefined) ?? '';
  return [
    { role: 'user', content: prompt },
    { role: 'assistant', content: response },
  ];
}

// ─── Semantic feed + similar echoes (For You / "more like this" rail) ────────

type SemanticFeedRow = SupabaseEchoRow & SupabaseProfileRow & { distance: number };

export async function fetchSemanticFeed(limit = 30): Promise<FeedItem[]> {
  const uid = await getSessionUserId();
  if (!uid) return [];
  const { data, error } = await supabase.rpc('get_semantic_feed', {
    p_user_id: uid,
    p_limit: limit,
  });
  if (error) throw error;
  const rows = (data ?? []) as SemanticFeedRow[];
  if (rows.length === 0) return [];

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

  const ids = rows.map(r => r.id);
  const [{ data: likeRows }, { data: bmRows }, { data: rpRows }] = await Promise.all([
    supabase.from('echo_likes').select('echo_id').eq('user_id', uid).in('echo_id', ids),
    supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid).in('echo_id', ids),
    supabase.from('echo_reposts').select('echo_id').eq('user_id', uid).in('echo_id', ids),
  ]);
  const liked = new Set((likeRows ?? []).map((r: { echo_id: string }) => r.echo_id));
  const bookmarked = new Set((bmRows ?? []).map((r: { echo_id: string }) => r.echo_id));
  const reposted = new Set((rpRows ?? []).map((r: { echo_id: string }) => r.echo_id));

  return rows.map(row =>
    mapEchoRowToFeedItem(row as SupabaseEchoRow, profileById.get(row.author_id), liked, bookmarked, reposted)
  );
}

export async function fetchSimilarEchoes(echoId: string, limit = 6): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('get_similar_echoes', {
    p_echo_id: echoId,
    p_limit: limit,
  });
  if (error) throw error;
  const rows = (data ?? []) as (SupabaseEchoRow & SupabaseProfileRow & { distance: number })[];
  if (rows.length === 0) return [];
  const empty = new Set<string>();
  return rows.map(row => {
    const profile: SupabaseProfileRow = {
      id: row.author_id,
      username: row.username,
      display_name: row.display_name,
      bio: undefined,
      avatar_color: row.avatar_color,
      avatar_url: row.avatar_url,
      is_verified: row.is_verified,
      created_at: '',
    };
    return mapEchoRowToFeedItem(row as SupabaseEchoRow, profile, empty, empty, empty);
  });
}

// ─── Evolutions (trending remix lineages) ────────────────────────────────────

type TrendingEvolutionRow = {
  root_id: string;
  root_title: string | null;
  root_prompt: string;
  root_response: string;
  root_created_at: string;
  root_media_urls: string[] | null;
  root_author_id: string;
  root_username: string;
  root_display_name: string;
  root_avatar_color: string;
  root_avatar_url: string | null;
  root_is_verified: boolean;
  branch_count: number;
  unique_authors: number;
  tree_engagement: number;
  newest_remix_at: string | null;
};

export async function fetchTrendingEvolutions(limit = 30): Promise<EvolutionGroup[]> {
  const { data, error } = await supabase.rpc('get_trending_evolutions', { p_limit: limit });
  if (error) throw error;
  const rows = (data ?? []) as TrendingEvolutionRow[];
  return rows.map(r => ({
    rootId: r.root_id,
    rootTitle: r.root_title,
    rootPrompt: r.root_prompt,
    rootResponse: r.root_response,
    rootCreatedAt: r.root_created_at,
    rootMediaUrls: r.root_media_urls ?? undefined,
    rootAuthorId: r.root_author_id,
    rootUsername: r.root_username,
    rootDisplayName: r.root_display_name,
    rootAvatarColor: r.root_avatar_color,
    rootAvatarUrl: r.root_avatar_url ?? undefined,
    rootIsVerified: r.root_is_verified,
    branchCount: r.branch_count,
    uniqueAuthors: r.unique_authors,
    treeEngagement: r.tree_engagement,
    newestRemixAt: r.newest_remix_at,
  }));
}

type RemixTreeRow = {
  id: string;
  parent_echo_id: string | null;
  depth: number;
  author_id: string;
  title: string | null;
  prompt: string;
  response: string;
  likes_count: number;
  comment_count: number;
  repost_count: number;
  remix_count: number;
  created_at: string;
  media_urls: string[] | null;
  username: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  is_verified: boolean;
};

export async function fetchRemixTree(rootId: string): Promise<RemixTreeNode[]> {
  const { data, error } = await supabase.rpc('get_remix_tree', { p_root_id: rootId });
  if (error) throw error;
  const rows = (data ?? []) as RemixTreeRow[];
  return rows.map(r => ({
    id: r.id,
    parentEchoId: r.parent_echo_id,
    depth: r.depth,
    authorId: r.author_id,
    title: r.title,
    prompt: r.prompt,
    response: r.response,
    likesCount: r.likes_count,
    commentCount: r.comment_count,
    repostCount: r.repost_count,
    remixCount: r.remix_count,
    createdAt: r.created_at,
    mediaUrls: r.media_urls ?? undefined,
    username: r.username,
    displayName: r.display_name,
    avatarColor: r.avatar_color,
    avatarUrl: r.avatar_url ?? undefined,
    isVerified: r.is_verified,
  }));
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

// ─── Knowledge reactions ───────────────────────────────────────────────────
// Four-emoji reaction pile: 🤯 mind_blown, 📝 taking_notes, 💯 agree, 🤔 disagree.
// Each (echo, user, reaction) combo is unique; counter columns on public_echoes
// are kept in sync by DB triggers (adjust_echo_reaction_count).

import type { EchoReaction } from '../types';

/** Toggle a reaction the current user has on an echo. */
export async function setRemoteEchoReaction(
  echoId: string,
  reaction: EchoReaction,
  on: boolean,
): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (on) {
    const { error } = await supabase
      .from('echo_reactions')
      .insert({ echo_id: echoId, user_id: uid, reaction });
    if (error && !error.message.includes('duplicate')) throw error;
    // Gen-Z gamification: bump daily_react quest.
    bumpQuestProgress('daily_react').catch(() => undefined);
  } else {
    const { error } = await supabase
      .from('echo_reactions')
      .delete()
      .eq('echo_id', echoId)
      .eq('user_id', uid)
      .eq('reaction', reaction);
    if (error) throw error;
  }
}

/** Same shape but for comments. */
export async function setRemoteCommentReaction(
  commentId: string,
  reaction: EchoReaction,
  on: boolean,
): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (on) {
    const { error } = await supabase
      .from('comment_reactions')
      .insert({ comment_id: commentId, user_id: uid, reaction });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    const { error } = await supabase
      .from('comment_reactions')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', uid)
      .eq('reaction', reaction);
    if (error) throw error;
  }
}

/** Fetch all reactions the current user has given on a set of echo IDs.
 *  Returns a Map<echoId, EchoReaction[]> for efficient lookup when building
 *  FeedItems. */
export async function fetchUserReactions(
  echoIds: string[],
): Promise<Map<string, EchoReaction[]>> {
  const result = new Map<string, EchoReaction[]>();
  if (!echoIds.length) return result;
  const uid = await getSessionUserId();
  if (!uid) return result;
  const { data, error } = await supabase
    .from('echo_reactions')
    .select('echo_id, reaction')
    .eq('user_id', uid)
    .in('echo_id', echoIds);
  if (error) {
    console.warn('[reactions] fetchUserReactions failed', error.message);
    return result;
  }
  for (const row of data ?? []) {
    const list = result.get(row.echo_id) ?? [];
    list.push(row.reaction as EchoReaction);
    result.set(row.echo_id, list);
  }
  return result;
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
  const { data, error } = await supabase
    .from('echo_comments')
    .insert({
      echo_id: echoId,
      author_id: uid,
      content,
      ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
    })
    .select('id')
    .single();
  if (error) throw error;

  // Parse + wire @-mentions. Best-effort; never blocks comment insert.
  const usernames = parseMentions(content);
  if (usernames.length && data?.id) {
    insertCommentMentions(data.id, usernames).catch(() => undefined);
  }
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

/**
 * Set or clear the authenticated user's pinned signature echo.
 * Passing null unpins. RLS guarantees you can only update your own row.
 */
export async function setPinnedEcho(echoId: string | null): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase
    .from('profiles')
    .update({ pinned_echo_id: echoId })
    .eq('id', uid);
  if (error) throw error;
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
  pronouns?: string | null;
  mood?: string | null;
  mood_expires_at?: string | null;
}): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('profiles').update(updates).eq('id', uid);
  if (error) throw error;
}

// ─── Badges ────────────────────────────────────────────────────────────────

export interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'special';
  criteria: Record<string, unknown>;
  earned?: boolean;
  awarded_at?: string;
}

/** All defined badges + which ones the current viewer has earned. */
export async function fetchBadges(): Promise<Badge[]> {
  const { data: allBadges, error } = await supabase
    .from('badges')
    .select('id, slug, name, description, icon, tier, criteria')
    .order('tier', { ascending: true });
  if (error) throw error;
  const list = (allBadges as Badge[]) ?? [];

  const uid = await getSessionUserId();
  if (!uid) return list;
  const { data: earned } = await supabase
    .from('user_badges')
    .select('badge_id, awarded_at')
    .eq('user_id', uid);
  const earnedMap = new Map((earned as { badge_id: string; awarded_at: string }[] ?? []).map(e => [e.badge_id, e.awarded_at]));
  return list.map(b => ({ ...b, earned: earnedMap.has(b.id), awarded_at: earnedMap.get(b.id) }));
}

/** Award a badge to the current viewer (idempotent). Used by auto-award engine
 *  triggered on key actions like first echo, streak hits, mind-blown milestones. */
export async function awardBadge(slug: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) return;
  const { data: badge } = await supabase.from('badges').select('id').eq('slug', slug).maybeSingle();
  if (!badge) return;
  const { error } = await supabase
    .from('user_badges')
    .insert({ user_id: uid, badge_id: (badge as { id: string }).id });
  if (error && !error.message.includes('duplicate')) {
    console.warn('[badges] award failed', error.message);
  }
}

// ─── Quests ────────────────────────────────────────────────────────────────

export interface Quest {
  id: string;
  slug: string;
  title: string;
  description: string;
  goal_type: 'post_count' | 'reaction_count' | 'streak_days' | 'mentions_count' | 'daily_answers';
  goal_value: number;
  reward_xp: number;
  reward_badge_id: string | null;
  recurrence: 'daily' | 'weekly' | 'monthly' | 'once';
  active: boolean;
  /** Viewer's progress on this quest (current period). */
  progress?: number;
  completed_at?: string | null;
}

/** Active quests + the viewer's progress on each (for the current recurrence window). */
export async function fetchActiveQuests(): Promise<Quest[]> {
  const { data: rows, error } = await supabase
    .from('quests')
    .select('id, slug, title, description, goal_type, goal_value, reward_xp, reward_badge_id, recurrence, active')
    .eq('active', true)
    .order('recurrence', { ascending: true });
  if (error) throw error;
  const list = (rows as Quest[]) ?? [];

  const uid = await getSessionUserId();
  if (!uid) return list;

  // Pull all user_quests for this viewer; client filters by recurrence window
  // (started_at within current day/week/month).
  const { data: ups } = await supabase
    .from('user_quests')
    .select('quest_id, started_at, progress, completed_at')
    .eq('user_id', uid);
  const upsList = (ups as { quest_id: string; started_at: string; progress: number; completed_at: string | null }[] ?? []);

  return list.map((q) => {
    // Filter user_quest rows to the current recurrence window.
    const now = Date.now();
    const winStart = (() => {
      const d = new Date();
      if (q.recurrence === 'daily') { d.setHours(0, 0, 0, 0); return d.getTime(); }
      if (q.recurrence === 'weekly') { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d.getTime(); }
      if (q.recurrence === 'monthly') { d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }
      return 0; // 'once' — any past row counts
    })();
    const match = upsList.find(r => r.quest_id === q.id && new Date(r.started_at).getTime() >= winStart);
    return {
      ...q,
      progress: match?.progress ?? 0,
      completed_at: match?.completed_at ?? null,
    };
  });
}

/** Update the viewer's progress on a quest. Upserts a user_quests row for the
 *  current recurrence window. */
export async function bumpQuestProgress(slug: string, delta = 1): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) return;
  const { data: quest } = await supabase
    .from('quests')
    .select('id, goal_value, recurrence')
    .eq('slug', slug)
    .maybeSingle();
  if (!quest) return;
  const q = quest as { id: string; goal_value: number; recurrence: string };

  const winStartIso = (() => {
    const d = new Date();
    if (q.recurrence === 'daily') { d.setHours(0, 0, 0, 0); return d.toISOString(); }
    if (q.recurrence === 'weekly') { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d.toISOString(); }
    if (q.recurrence === 'monthly') { d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString(); }
    return new Date(0).toISOString();
  })();

  // Find existing row in this window
  const { data: existing } = await supabase
    .from('user_quests')
    .select('progress, completed_at, started_at')
    .eq('user_id', uid)
    .eq('quest_id', q.id)
    .gte('started_at', winStartIso)
    .maybeSingle();

  if (existing) {
    const ex = existing as { progress: number; completed_at: string | null; started_at: string };
    const newProgress = Math.min(q.goal_value, ex.progress + delta);
    const completed = newProgress >= q.goal_value;
    await supabase
      .from('user_quests')
      .update({
        progress: newProgress,
        ...(completed && !ex.completed_at ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq('user_id', uid)
      .eq('quest_id', q.id)
      .eq('started_at', ex.started_at);
  } else {
    const completed = delta >= q.goal_value;
    await supabase.from('user_quests').insert({
      user_id: uid,
      quest_id: q.id,
      started_at: winStartIso,
      progress: Math.min(q.goal_value, delta),
      ...(completed ? { completed_at: new Date().toISOString() } : {}),
    });
  }
}

// ─── Year in Echo ──────────────────────────────────────────────────────────

export interface YearWrap {
  user_id: string;
  year: number;
  total_echoes: number;
  total_likes_received: number;
  total_reactions: number;
  top_topics: string[];
  top_echo_id: string | null;
  longest_streak: number;
  computed_at: string;
  /** When present (because we just computed it), this is the top echo's preview prompt. */
  top_echo_prompt?: string | null;
}

/** Fetch the cached Year in Echo or compute it lazily by aggregating echoes. */
export async function fetchOrComputeYearWrap(year: number = new Date().getFullYear()): Promise<YearWrap | null> {
  const uid = await getSessionUserId();
  if (!uid) return null;

  // Try cached first
  const { data: cached } = await supabase
    .from('year_wraps')
    .select('*')
    .eq('user_id', uid)
    .eq('year', year)
    .maybeSingle();
  if (cached) return cached as YearWrap;

  // Compute on the fly: aggregate the viewer's echoes from this year.
  const yearStart = new Date(year, 0, 1).toISOString();
  const yearEnd = new Date(year + 1, 0, 1).toISOString();
  const { data: rows } = await supabase
    .from('public_echoes')
    .select('id, prompt, response, likes_count, mind_blown_count, taking_notes_count, agree_count, disagree_count, created_at')
    .eq('author_id', uid)
    .gte('created_at', yearStart)
    .lt('created_at', yearEnd);
  const list = (rows as Array<{
    id: string; prompt: string; response: string; likes_count: number;
    mind_blown_count: number; taking_notes_count: number; agree_count: number; disagree_count: number;
    created_at: string;
  }> ?? []);

  const total_echoes = list.length;
  const total_likes_received = list.reduce((acc, r) => acc + (r.likes_count ?? 0), 0);
  const total_reactions = list.reduce((acc, r) => acc + (r.mind_blown_count ?? 0) + (r.taking_notes_count ?? 0) + (r.agree_count ?? 0) + (r.disagree_count ?? 0), 0);

  // Extract top topics from hashtags in prompt+response
  const tagCount = new Map<string, number>();
  for (const r of list) {
    const tags = `${r.prompt} ${r.response}`.match(/#[\wÀ-ɏ]+/gi) ?? [];
    for (const tag of tags) {
      const t = tag.toLowerCase();
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
  }
  const top_topics = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  // Pick the top echo by likes + reactions
  const ranked = list.map(r => ({
    id: r.id,
    score: (r.likes_count ?? 0) + (r.mind_blown_count ?? 0) * 2 + (r.taking_notes_count ?? 0) + (r.agree_count ?? 0) + (r.disagree_count ?? 0),
    prompt: r.prompt,
  })).sort((a, b) => b.score - a.score);
  const top = ranked[0];

  // Persist for next time
  const wrap: YearWrap = {
    user_id: uid,
    year,
    total_echoes,
    total_likes_received,
    total_reactions,
    top_topics,
    top_echo_id: top?.id ?? null,
    longest_streak: 0, // Computed from retention separately
    computed_at: new Date().toISOString(),
    top_echo_prompt: top?.prompt ?? null,
  };
  await supabase.from('year_wraps').upsert({
    user_id: uid, year,
    total_echoes,
    total_likes_received,
    total_reactions,
    top_topics,
    top_echo_id: top?.id ?? null,
    longest_streak: 0,
    computed_at: wrap.computed_at,
  });
  return wrap;
}

// ─── Office Hours (scheduled AMA) ──────────────────────────────────────────

export interface OfficeHour {
  id: string;
  host_id: string;
  topic: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  rsvp_count: number;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  created_at: string;
  host?: {
    username: string;
    display_name: string;
    avatar_color: string;
    avatar_url?: string | null;
    is_verified: boolean;
  };
  has_rsvp?: boolean;
}

export interface OfficeHourQuestion {
  id: string;
  office_hour_id: string;
  asker_id: string;
  question: string;
  answer: string | null;
  upvote_count: number;
  created_at: string;
  asker?: {
    username: string;
    display_name: string;
    avatar_color: string;
  };
  has_upvoted?: boolean;
}

/** Upcoming + live office hours, sorted by start time. */
export async function fetchUpcomingOfficeHours(limit = 30): Promise<OfficeHour[]> {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('office_hours')
    .select('id, host_id, topic, description, starts_at, ends_at, rsvp_count, status, created_at')
    .gte('ends_at', now)
    .in('status', ['scheduled', 'live'])
    .order('starts_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  const list = (rows ?? []) as Array<Omit<OfficeHour, 'host' | 'has_rsvp'>>;
  if (!list.length) return [];

  const hostIds = [...new Set(list.map(r => r.host_id))];
  const [profilesRes, rsvpsRes] = await Promise.allSettled([
    supabase.from('profiles').select('id, username, display_name, avatar_color, avatar_url, is_verified').in('id', hostIds),
    (async () => {
      const uid = await getSessionUserId();
      if (!uid) return { data: [] as { office_hour_id: string }[] };
      return supabase.from('office_hour_rsvps').select('office_hour_id').eq('user_id', uid).in('office_hour_id', list.map(o => o.id));
    })(),
  ]);

  const profileById = new Map<string, { username: string; display_name: string; avatar_color: string; avatar_url?: string | null; is_verified: boolean }>();
  if (profilesRes.status === 'fulfilled') {
    for (const p of (profilesRes.value.data as Array<{ id: string; username: string; display_name: string; avatar_color: string; avatar_url?: string | null; is_verified: boolean }> | null) ?? []) {
      profileById.set(p.id, p);
    }
  }
  const rsvpSet = new Set<string>(
    (rsvpsRes.status === 'fulfilled' ? rsvpsRes.value.data ?? [] : []).map((r: { office_hour_id: string }) => r.office_hour_id),
  );

  return list.map(r => ({ ...r, host: profileById.get(r.host_id), has_rsvp: rsvpSet.has(r.id) }));
}

/** Single office hour with host + RSVP info. */
export async function fetchOfficeHour(id: string): Promise<OfficeHour | null> {
  const { data: row, error } = await supabase
    .from('office_hours')
    .select('id, host_id, topic, description, starts_at, ends_at, rsvp_count, status, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !row) return null;
  const { data: host } = await supabase
    .from('profiles')
    .select('username, display_name, avatar_color, avatar_url, is_verified')
    .eq('id', (row as Omit<OfficeHour, 'host' | 'has_rsvp'>).host_id)
    .maybeSingle();
  const uid = await getSessionUserId();
  let has_rsvp = false;
  if (uid) {
    const { data: r } = await supabase
      .from('office_hour_rsvps')
      .select('office_hour_id')
      .eq('office_hour_id', id)
      .eq('user_id', uid)
      .maybeSingle();
    has_rsvp = !!r;
  }
  return {
    ...(row as Omit<OfficeHour, 'host' | 'has_rsvp'>),
    host: (host as { username: string; display_name: string; avatar_color: string; avatar_url?: string | null; is_verified: boolean } | null) ?? undefined,
    has_rsvp,
  };
}

export async function createOfficeHour(input: {
  topic: string;
  description?: string;
  starts_at: string;
  duration_minutes: number;
}): Promise<OfficeHour> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const ends_at = new Date(new Date(input.starts_at).getTime() + input.duration_minutes * 60000).toISOString();
  const { data, error } = await supabase
    .from('office_hours')
    .insert({
      host_id: uid,
      topic: input.topic.trim(),
      description: input.description?.trim() || null,
      starts_at: input.starts_at,
      ends_at,
    })
    .select('id, host_id, topic, description, starts_at, ends_at, rsvp_count, status, created_at')
    .single();
  if (error) throw error;
  return data as OfficeHour;
}

export async function setOfficeHourRSVP(officeHourId: string, going: boolean): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (going) {
    const { error } = await supabase.from('office_hour_rsvps').insert({ office_hour_id: officeHourId, user_id: uid });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    const { error } = await supabase.from('office_hour_rsvps').delete().eq('office_hour_id', officeHourId).eq('user_id', uid);
    if (error) throw error;
  }
}

export async function fetchOfficeHourQuestions(officeHourId: string): Promise<OfficeHourQuestion[]> {
  const { data: rows, error } = await supabase
    .from('office_hour_questions')
    .select('id, office_hour_id, asker_id, question, answer, upvote_count, created_at')
    .eq('office_hour_id', officeHourId)
    .order('upvote_count', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  const list = (rows ?? []) as Array<Omit<OfficeHourQuestion, 'asker' | 'has_upvoted'>>;
  if (!list.length) return [];

  const askerIds = [...new Set(list.map(r => r.asker_id))];
  const [profilesRes, upvotesRes] = await Promise.allSettled([
    supabase.from('profiles').select('id, username, display_name, avatar_color').in('id', askerIds),
    (async () => {
      const uid = await getSessionUserId();
      if (!uid) return { data: [] as { question_id: string }[] };
      return supabase
        .from('office_hour_question_upvotes')
        .select('question_id')
        .eq('user_id', uid)
        .in('question_id', list.map(r => r.id));
    })(),
  ]);

  const pById = new Map<string, { username: string; display_name: string; avatar_color: string }>();
  if (profilesRes.status === 'fulfilled') {
    for (const p of (profilesRes.value.data as Array<{ id: string; username: string; display_name: string; avatar_color: string }> | null) ?? []) {
      pById.set(p.id, p);
    }
  }
  const upvoted = new Set<string>(
    (upvotesRes.status === 'fulfilled' ? upvotesRes.value.data ?? [] : []).map((r: { question_id: string }) => r.question_id),
  );

  return list.map(r => ({
    ...r,
    asker: pById.get(r.asker_id),
    has_upvoted: upvoted.has(r.id),
  }));
}

export async function submitOfficeHourQuestion(officeHourId: string, question: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('office_hour_questions').insert({
    office_hour_id: officeHourId,
    asker_id: uid,
    question: question.trim(),
  });
  if (error) throw error;
}

export async function setOfficeHourQuestionUpvote(questionId: string, on: boolean): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (on) {
    const { error } = await supabase.from('office_hour_question_upvotes').insert({ question_id: questionId, user_id: uid });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    const { error } = await supabase.from('office_hour_question_upvotes').delete().eq('question_id', questionId).eq('user_id', uid);
    if (error) throw error;
  }
}

// ─── Salons (communities) ──────────────────────────────────────────────────

export interface Salon {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_color: string;
  topic_tags: string[];
  owner_id: string;
  member_count: number;
  echo_count: number;
  created_at: string;
  /** True when the current viewer is a member (computed client-side). */
  is_member?: boolean;
}

/** Browse list — newest salons first. */
export async function fetchSalons(limit = 30): Promise<Salon[]> {
  const { data, error } = await supabase
    .from('salons')
    .select('id, slug, name, description, cover_color, topic_tags, owner_id, member_count, echo_count, created_at')
    .order('member_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const list = (data as Salon[]) ?? [];
  // Annotate membership for the current viewer.
  const uid = await getSessionUserId();
  if (!uid || !list.length) return list;
  const ids = list.map(s => s.id);
  const { data: memberRows } = await supabase
    .from('salon_members')
    .select('salon_id')
    .eq('user_id', uid)
    .in('salon_id', ids);
  const memberOf = new Set((memberRows as { salon_id: string }[] ?? []).map(r => r.salon_id));
  return list.map(s => ({ ...s, is_member: memberOf.has(s.id) }));
}

/** Single salon by slug (for the salon detail page). */
export async function fetchSalonBySlug(slug: string): Promise<Salon | null> {
  const { data, error } = await supabase
    .from('salons')
    .select('id, slug, name, description, cover_color, topic_tags, owner_id, member_count, echo_count, created_at')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.warn('[salons] fetchSalonBySlug failed', error.message);
    return null;
  }
  if (!data) return null;
  const uid = await getSessionUserId();
  let is_member = false;
  if (uid) {
    const { data: m } = await supabase
      .from('salon_members')
      .select('salon_id')
      .eq('salon_id', (data as Salon).id)
      .eq('user_id', uid)
      .maybeSingle();
    is_member = !!m;
  }
  return { ...(data as Salon), is_member };
}

/** Create a salon. Owner is auto-added as the first member by DB trigger. */
export async function createSalon(input: {
  name: string;
  slug: string;
  description?: string;
  cover_color?: string;
  topic_tags?: string[];
}): Promise<Salon> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const slug = input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
  if (slug.length < 3) throw new Error('Slug must be at least 3 characters');
  const { data, error } = await supabase
    .from('salons')
    .insert({
      slug,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      cover_color: input.cover_color || '#7C3AED',
      topic_tags: input.topic_tags ?? [],
      owner_id: uid,
    })
    .select('id, slug, name, description, cover_color, topic_tags, owner_id, member_count, echo_count, created_at')
    .single();
  if (error) throw error;
  return data as Salon;
}

/** Toggle membership. */
export async function setSalonMembership(salonId: string, join: boolean): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  if (join) {
    const { error } = await supabase
      .from('salon_members')
      .insert({ salon_id: salonId, user_id: uid });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    const { error } = await supabase
      .from('salon_members')
      .delete()
      .eq('salon_id', salonId)
      .eq('user_id', uid);
    if (error) throw error;
  }
}

/** Fetch echoes scoped to a salon. Re-uses the same mapping as the global feed. */
export async function fetchSalonEchoes(salonId: string, limit = 30): Promise<FeedItem[]> {
  const { data: rows, error } = await supabase
    .from('public_echoes')
    .select(ECHO_SELECT)
    .eq('salon_id', salonId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const list = (rows ?? []) as SupabaseEchoRow[];
  if (!list.length) return [];
  const authorIds = [...new Set(list.map(r => r.author_id))];
  const { data: profiles } = await supabase.from('profiles').select(PROFILE_SELECT).in('id', authorIds);
  const profileById = new Map((profiles as SupabaseProfileRow[] ?? []).map(p => [p.id, p]));
  const empty = new Set<string>();
  return list.map(r => mapEchoRowToFeedItem(r, profileById.get(r.author_id), empty, empty, empty));
}

// ─── Daily Question (BeReal-style ritual) ──────────────────────────────────

export interface DailyQuestion {
  id: string;
  active_date: string;
  question: string;
}

export interface DailyAnswerWithAuthor {
  id: string;
  question_id: string;
  user_id: string;
  answer: string;
  echo_id: string | null;
  created_at: string;
  author: {
    username: string;
    display_name: string;
    avatar_color: string;
    avatar_url?: string | null;
    is_verified: boolean;
  };
}

/** Fetch today's daily question. Returns null when the seed is exhausted. */
export async function fetchTodaysDailyQuestion(): Promise<DailyQuestion | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('daily_questions')
    .select('id, active_date, question')
    .eq('active_date', today)
    .maybeSingle();
  if (error) {
    console.warn('[daily] fetch question failed', error.message);
    return null;
  }
  return (data as DailyQuestion) ?? null;
}

/** Fetch the viewer's answer (if any) to a given daily question. */
export async function fetchOwnDailyAnswer(questionId: string): Promise<string | null> {
  const uid = await getSessionUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('daily_answers')
    .select('answer')
    .eq('question_id', questionId)
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { answer: string }).answer;
}

/** Submit (or replace) the viewer's answer to a daily question. */
export async function submitDailyAnswer(questionId: string, answer: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const trimmed = answer.trim();
  if (!trimmed) throw new Error('Answer cannot be empty');
  const { data, error } = await supabase
    .from('daily_answers')
    .upsert(
      { question_id: questionId, user_id: uid, answer: trimmed, embedding: null },
      { onConflict: 'question_id,user_id' },
    )
    .select('id')
    .single();
  if (error) throw error;
  // Bump the daily-answer quest. Best-effort.
  bumpQuestProgress('daily_answer').catch(() => undefined);
  // Embed the answer so it can be ranked by divergence. Fire-and-forget; the
  // embedding is nulled above on edit so a stale vector never lingers.
  const answerId = (data as { id: string } | null)?.id;
  if (answerId) triggerEmbedDailyAnswer(answerId).catch(() => undefined);
}

/**
 * Asks the embed-daily-answer edge function to compute and persist the
 * embedding for a daily answer. Best-effort — divergence ranking simply
 * omits answers that haven't been embedded yet.
 */
export async function triggerEmbedDailyAnswer(answerId: string): Promise<void> {
  try {
    await supabase.functions.invoke('embed-daily-answer', { body: { answer_id: answerId } });
  } catch {
    // Best-effort; a later submit or backfill can reconcile.
  }
}

/** Fetch all answers for a given daily question, with author profile snippets.
 *  Reveal-after-answer is enforced client-side — callers should pass the viewer's
 *  own answer state and only render this list when the viewer has answered. */
export async function fetchDailyAnswers(questionId: string, limit = 100): Promise<DailyAnswerWithAuthor[]> {
  const { data: rows, error } = await supabase
    .from('daily_answers')
    .select('id, question_id, user_id, answer, echo_id, created_at')
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const list = (rows ?? []) as Array<{
    id: string; question_id: string; user_id: string; answer: string;
    echo_id: string | null; created_at: string;
  }>;
  if (!list.length) return [];

  const authorIds = [...new Set(list.map(r => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_color, avatar_url, is_verified')
    .in('id', authorIds);
  const profileById = new Map((profiles as Array<{
    id: string; username: string; display_name: string; avatar_color: string;
    avatar_url?: string | null; is_verified: boolean;
  }> ?? []).map(p => [p.id, p]));

  return list.map((r) => {
    const profile = profileById.get(r.user_id);
    return {
      id: r.id,
      question_id: r.question_id,
      user_id: r.user_id,
      answer: r.answer,
      echo_id: r.echo_id,
      created_at: r.created_at,
      author: {
        username: profile?.username ?? 'unknown',
        display_name: profile?.display_name ?? profile?.username ?? 'unknown',
        avatar_color: profile?.avatar_color ?? '#3B82F6',
        avatar_url: profile?.avatar_url ?? null,
        is_verified: profile?.is_verified ?? false,
      },
    };
  });
}

/** A daily answer plus how far it diverges from the day's consensus take. */
export type DivergentDailyAnswer = DailyAnswerWithAuthor & {
  /** Cosine distance from the consensus centroid, normalised to a 0–100 "divergence" readout. */
  divergence: number;
};

interface DivergentDailyAnswerRow {
  id: string;
  user_id: string;
  answer: string;
  echo_id: string | null;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  divergence: number | null;
}

/**
 * Fetch the day's answers ranked by embedding divergence — the takes that sit
 * furthest from the consensus float to the top. Excludes the viewer's own
 * answer and anyone they block/mute. Returns [] until at least a couple of
 * answers have been embedded by the embed-daily-answer function.
 */
export async function fetchDivergentDailyAnswers(questionId: string, limit = 30): Promise<DivergentDailyAnswer[]> {
  const uid = await getSessionUserId();
  const { data, error } = await supabase.rpc('get_divergent_daily_answers', {
    p_question_id: questionId,
    p_viewer_id: uid,
    p_limit: limit,
  });
  if (error) throw error;
  const rows = (data ?? []) as DivergentDailyAnswerRow[];
  return rows.map((r) => ({
    id: r.id,
    question_id: questionId,
    user_id: r.user_id,
    answer: r.answer,
    echo_id: r.echo_id,
    created_at: r.created_at,
    author: {
      username: r.username ?? 'unknown',
      display_name: r.display_name ?? r.username ?? 'unknown',
      avatar_color: r.avatar_color ?? '#3B82F6',
      avatar_url: r.avatar_url ?? null,
      is_verified: r.is_verified ?? false,
    },
    // cosine distance is 0..2; map to a friendlier 0–100 readout (1.0 distance ≈ orthogonal ≈ 50).
    divergence: Math.max(0, Math.min(100, Math.round(((r.divergence ?? 0) / 2) * 100))),
  }));
}

// ─── User search & mentions ────────────────────────────────────────────────

/** Lightweight profile snippet returned by user search (cheaper than a full SupabaseProfileRow). */
export interface UserSearchHit {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  avatar_url?: string | null;
  is_verified: boolean;
}

/** Search profiles by username prefix or display-name substring. */
export async function searchRemoteUsers(query: string, limit = 8): Promise<UserSearchHit[]> {
  const q = query.trim().replace(/^@+/, '');
  if (!q) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_color, avatar_url, is_verified')
    .or(`username.ilike.${q}%,display_name.ilike.%${q}%`)
    .order('follower_count', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[users] search failed', error.message);
    return [];
  }
  return (data as UserSearchHit[]) ?? [];
}

/** Extract @-mentions from a free-form text (echo body, comment, etc). Returns unique lowercase usernames. */
export function parseMentions(text: string): string[] {
  const m = text.match(/@([a-zA-Z0-9_]{2,32})/g);
  if (!m) return [];
  const set = new Set(m.map(s => s.slice(1).toLowerCase()));
  return [...set];
}

/** Insert echo_mentions rows for the given echo, resolving usernames to IDs. */
export async function insertEchoMentions(echoId: string, usernames: string[]): Promise<void> {
  if (!usernames.length) return;
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', usernames);
  if (error) {
    console.warn('[mentions] resolve failed', error.message);
    return;
  }
  const rows = (profiles ?? []).map(p => ({ echo_id: echoId, mentioned_user_id: p.id }));
  if (!rows.length) return;
  const { error: insErr } = await supabase.from('echo_mentions').insert(rows);
  // Duplicates are fine — PK on (echo_id, mentioned_user_id).
  if (insErr && !insErr.message.includes('duplicate')) {
    console.warn('[mentions] insert failed', insErr.message);
  }
}

/** Insert comment_mentions rows for the given comment. */
export async function insertCommentMentions(commentId: string, usernames: string[]): Promise<void> {
  if (!usernames.length) return;
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', usernames);
  if (error) {
    console.warn('[mentions] resolve failed', error.message);
    return;
  }
  const rows = (profiles ?? []).map(p => ({ comment_id: commentId, mentioned_user_id: p.id }));
  if (!rows.length) return;
  const { error: insErr } = await supabase.from('comment_mentions').insert(rows);
  if (insErr && !insErr.message.includes('duplicate')) {
    console.warn('[mentions] insert failed', insErr.message);
  }
}

/** Set the viewer's current mood — auto-expires 24h from now. Clears the mood when text is empty. */
export async function setRemoteMood(mood: string | null): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const trimmed = mood?.trim() ? mood.trim().slice(0, 60) : null;
  const expiresAt = trimmed ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
  const { error } = await supabase
    .from('profiles')
    .update({ mood: trimmed, mood_expires_at: expiresAt })
    .eq('id', uid);
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

// ── Thinking-partner matching ────────────────────────────────
//
// Surfaces users by how their "thinking centroid" (avg echo embedding)
// compares to the viewer's — kindred minds ('similar') or productive friction
// ('different'). See migration 20260529010000_thinking_partners.sql.

export type ThinkingPartnerMode = 'similar' | 'different';

/** A matched user plus their cosine similarity to the viewer's centroid. */
export type ThinkingPartner = import('../types').User & { affinity: number };

interface ThinkingPartnerRow {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  follower_count: number | null;
  echo_count: number | null;
  affinity: number | null;
}

export async function fetchThinkingPartners(
  mode: ThinkingPartnerMode = 'similar',
  limit = 12,
): Promise<ThinkingPartner[]> {
  const uid = await getSessionUserId();
  if (!uid) return [];
  const { data, error } = await supabase.rpc('get_thinking_partners', {
    p_user_id: uid,
    p_limit: limit,
    p_mode: mode,
  });
  if (error) throw error;
  return ((data ?? []) as ThinkingPartnerRow[]).map(r => ({
    id: r.id,
    username: r.username ?? 'unknown',
    displayName: r.display_name ?? r.username ?? 'User',
    avatarColor: r.avatar_color ?? '#6366F1',
    avatarUrl: r.avatar_url ?? undefined,
    bio: r.bio ?? '',
    isVerified: r.is_verified ?? false,
    followerCount: r.follower_count ?? 0,
    followingCount: 0,
    echoCount: r.echo_count ?? 0,
    createdAt: '',
    affinity: r.affinity ?? 0,
  }));
}

// ── Thinking Fingerprint ─────────────────────────────────────

/** An AI-synthesised portrait of how a user thinks, derived from their echoes. */
export interface ThinkingFingerprint {
  archetype: string;
  summary: string;
  themes: string[];
  reasoningStyle: string;
  signatureQuestion: string;
  /** 0–100 embedding spread: low = focused thinker, high = wide-ranging. */
  range: number;
  echoCount: number;
}

/**
 * Fetch (or generate) a user's Thinking Fingerprint via the edge function.
 * Returns null when the user doesn't yet have enough echoes (or synthesis is
 * unavailable) — callers should treat null as "not ready yet".
 */
export async function fetchThinkingFingerprint(
  userId: string,
  force = false,
): Promise<ThinkingFingerprint | null> {
  const { data, error } = await supabase.functions.invoke('thinking-fingerprint', {
    body: { user_id: userId, force },
  });
  if (error) return null;
  const r = data as {
    ready?: boolean;
    echo_count?: number;
    archetype?: string;
    summary?: string;
    themes?: string[];
    reasoning_style?: string;
    signature_question?: string;
    range?: number;
  } | null;
  if (!r || r.ready !== true) return null;
  return {
    archetype: r.archetype ?? 'Original thinker',
    summary: r.summary ?? '',
    themes: Array.isArray(r.themes) ? r.themes : [],
    reasoningStyle: r.reasoning_style ?? '',
    signatureQuestion: r.signature_question ?? '',
    range: typeof r.range === 'number' ? r.range : 0,
    echoCount: r.echo_count ?? 0,
  };
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

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
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
