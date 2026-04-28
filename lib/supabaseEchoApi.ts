import { supabase } from './supabase';
import { FeedItem, Comment } from '../types';
import {
  mapEchoRowToFeedItem,
  SupabaseEchoRow,
  SupabaseProfileRow,
  extractHashtags,
} from './mapSupabaseEcho';

// ── Session UID cache ──────────────────────────────────────────────────────────
// Avoids a redundant async getSession() call on every API function.
// Cleared on SIGNED_OUT (see app/_layout.tsx AuthListener).

let _uidCache: { uid: string; exp: number } | null = null;

export async function getSessionUserId(): Promise<string | null> {
  const now = Date.now() / 1000;
  if (_uidCache && _uidCache.exp > now + 60) return _uidCache.uid;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { _uidCache = null; return null; }
  _uidCache = { uid: session.user.id, exp: session.expires_at ?? now + 3600 };
  return _uidCache.uid;
}

export function clearSessionCache(): void {
  _uidCache = null;
}

// ── Shared view row type ───────────────────────────────────────────────────────

type ViewRow = SupabaseEchoRow & {
  username: string;
  display_name: string;
  avatar_color: string;
  is_verified: boolean;
};

function mapViewRowToFeedItem(
  row: ViewRow,
  liked: Set<string>,
  bookmarked: Set<string>,
): FeedItem {
  const username = row.username ?? 'unknown';
  return {
    id: row.id,
    userId: row.author_id,
    username,
    displayName: row.display_name || username,
    avatarColor: row.avatar_color || '#3B82F6',
    isVerified: row.is_verified ?? false,
    prompt: row.prompt,
    response: row.response,
    mediaUris: (row as any).media_uris ?? undefined,
    videoUri: (row as any).video_uri ?? undefined,
    likes: row.likes_count ?? 0,
    isLiked: liked.has(row.id),
    isBookmarked: bookmarked.has(row.id),
    isReposted: false,
    repostCount: row.repost_count ?? 0,
    commentCount: row.comment_count ?? 0,
    viewCount: row.view_count ?? 0,
    hashtags: extractHashtags(`${row.prompt} ${row.response}`),
    createdAt: row.created_at,
  };
}

const VIEW_COLUMNS =
  'id, author_id, title, prompt, response, media_uris, video_uri, likes_count, comment_count, repost_count, view_count, created_at, username, display_name, avatar_color, is_verified';

// ── Feed ──────────────────────────────────────────────────────────────────────

export async function fetchRemoteFeed(): Promise<FeedItem[]> {
  const uid = await getSessionUserId();

  // All three queries run in parallel — view collapses the former echoes+profiles waterfall
  const [echoRes, likeRes, bmRes] = await Promise.all([
    supabase
      .from('public_echoes_with_author')
      .select(VIEW_COLUMNS)
      .order('created_at', { ascending: false }),
    uid
      ? supabase.from('echo_likes').select('echo_id').eq('user_id', uid)
      : Promise.resolve({ data: [] as { echo_id: string }[], error: null }),
    uid
      ? supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid)
      : Promise.resolve({ data: [] as { echo_id: string }[], error: null }),
  ]);

  if (echoRes.error) throw echoRes.error;
  const rows = (echoRes.data ?? []) as ViewRow[];
  if (!rows.length) return [];

  const liked      = new Set((likeRes.data ?? []).map(r => r.echo_id));
  const bookmarked = new Set((bmRes.data  ?? []).map(r => r.echo_id));

  return rows.map(r => mapViewRowToFeedItem(r, liked, bookmarked));
}

export async function fetchRemoteBookmarkedFeed(): Promise<FeedItem[]> {
  const uid = await getSessionUserId();
  if (!uid) return [];

  // Fetch bookmark IDs then the joined view rows in parallel with likes
  const { data: bms, error: e0 } = await supabase
    .from('echo_bookmarks')
    .select('echo_id')
    .eq('user_id', uid);
  if (e0) throw e0;

  const ids = (bms || []).map(r => r.echo_id);
  if (!ids.length) return [];

  const [echoRes, likeRes] = await Promise.all([
    supabase
      .from('public_echoes_with_author')
      .select(VIEW_COLUMNS)
      .in('id', ids),
    supabase.from('echo_likes').select('echo_id').eq('user_id', uid),
  ]);

  if (echoRes.error) throw echoRes.error;
  const rows = (echoRes.data ?? []) as ViewRow[];
  if (!rows.length) return [];

  const liked      = new Set((likeRes.data ?? []).map(r => r.echo_id));
  const bookmarked = new Set(ids);

  return rows.map(r => mapViewRowToFeedItem(r, liked, bookmarked));
}

// ── Echoes ────────────────────────────────────────────────────────────────────

export async function uploadMediaFile(
  localUri: string,
  mimeType: string,
): Promise<string> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');

  const ext = localUri.split('.').pop()?.split('?')[0] ?? 'jpg';
  const path = `${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const response = await fetch(localUri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('media')
    .upload(path, blob, { contentType: mimeType, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}

export async function insertRemoteEcho(params: {
  authorId: string;
  prompt: string;
  response: string;
  title?: string;
  mediaUris?: string[];
  videoUri?: string;
}): Promise<void> {
  const title =
    params.title?.trim() ||
    (params.prompt.trim().slice(0, 80) + (params.prompt.length > 80 ? '…' : ''));
  const { error } = await supabase.from('public_echoes').insert({
    author_id: params.authorId,
    title,
    prompt: params.prompt,
    response: params.response,
    media_uris: params.mediaUris ?? null,
    video_uri: params.videoUri ?? null,
  });
  if (error) throw error;
}

export async function fetchRemoteEchoesByAuthor(authorId: string): Promise<FeedItem[]> {
  const uid = await getSessionUserId();

  const [echoRes, likeRes, bmRes] = await Promise.all([
    supabase
      .from('public_echoes_with_author')
      .select(VIEW_COLUMNS)
      .eq('author_id', authorId)
      .order('created_at', { ascending: false }),
    uid
      ? supabase.from('echo_likes').select('echo_id').eq('user_id', uid)
      : Promise.resolve({ data: [] as { echo_id: string }[], error: null }),
    uid
      ? supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid)
      : Promise.resolve({ data: [] as { echo_id: string }[], error: null }),
  ]);

  if (echoRes.error) throw echoRes.error;
  const rows = (echoRes.data ?? []) as ViewRow[];
  if (!rows.length) return [];

  const liked      = new Set((likeRes.data ?? []).map(r => r.echo_id));
  const bookmarked = new Set((bmRes.data  ?? []).map(r => r.echo_id));

  return rows.map(r => mapViewRowToFeedItem(r, liked, bookmarked));
}

// ── Likes & Bookmarks ─────────────────────────────────────────────────────────

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

// ── Comments ──────────────────────────────────────────────────────────────────

export async function fetchRemoteComments(echoId: string): Promise<Comment[]> {
  const { data: rows, error } = await supabase
    .from('echo_comments')
    .select('id, echo_id, author_id, content, likes_count, created_at')
    .eq('echo_id', echoId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const list = rows || [];
  if (list.length === 0) return [];

  const authorIds = [...new Set(list.map((r: { author_id: string }) => r.author_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_color, is_verified')
    .in('id', authorIds);
  const profileById = new Map((profiles as SupabaseProfileRow[] || []).map(p => [p.id, p]));

  return list.map((r: {
    id: string;
    echo_id: string;
    author_id: string;
    content: string;
    likes_count: number;
    created_at: string;
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
      isVerified: p?.is_verified ?? false,
      content: r.content,
      likes: r.likes_count ?? 0,
      isLiked: false,
      replyCount: 0,
      createdAt: r.created_at,
    };
  });
}

export async function insertRemoteComment(echoId: string, content: string): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('echo_comments').insert({
    echo_id: echoId,
    author_id: uid,
    content,
  });
  if (error) throw error;
}

// ── Profiles ──────────────────────────────────────────────────────────────────

export async function fetchRemoteProfile(userId: string): Promise<SupabaseProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_color, is_verified')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as SupabaseProfileRow | null;
}

export async function updateRemoteProfile(updates: {
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_color?: string;
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

// ── Follows ───────────────────────────────────────────────────────────────────

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

// Collapsed to a single JOIN query via Supabase embedded select.
// Requires FK: follows.follower_id → profiles.id (named follows_follower_id_fkey).
export async function fetchRemoteFollowers(userId: string): Promise<SupabaseProfileRow[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('profiles!follows_follower_id_fkey(id, username, display_name, bio, avatar_color, is_verified)')
    .eq('following_id', userId);
  if (error) {
    // Fallback to two-step query if FK name differs in this project's schema
    const { data: rows, error: e2 } = await supabase
      .from('follows').select('follower_id').eq('following_id', userId);
    if (e2) throw e2;
    const ids = (rows || []).map((r: { follower_id: string }) => r.follower_id);
    if (!ids.length) return [];
    const { data: profiles, error: e3 } = await supabase
      .from('profiles').select('id, username, display_name, bio, avatar_color, is_verified').in('id', ids);
    if (e3) throw e3;
    return (profiles || []) as SupabaseProfileRow[];
  }
  return ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as SupabaseProfileRow[];
}

export async function fetchRemoteFollowingProfiles(userId: string): Promise<SupabaseProfileRow[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('profiles!follows_following_id_fkey(id, username, display_name, bio, avatar_color, is_verified)')
    .eq('follower_id', userId);
  if (error) {
    // Fallback to two-step query if FK name differs
    const { data: rows, error: e2 } = await supabase
      .from('follows').select('following_id').eq('follower_id', userId);
    if (e2) throw e2;
    const ids = (rows || []).map((r: { following_id: string }) => r.following_id);
    if (!ids.length) return [];
    const { data: profiles, error: e3 } = await supabase
      .from('profiles').select('id, username, display_name, bio, avatar_color, is_verified').in('id', ids);
    if (e3) throw e3;
    return (profiles || []) as SupabaseProfileRow[];
  }
  return ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as SupabaseProfileRow[];
}
