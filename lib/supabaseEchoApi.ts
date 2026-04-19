import { supabase } from './supabase';
import { FeedItem, Comment } from '../types';
import {
  mapEchoRowToFeedItem,
  SupabaseEchoRow,
  SupabaseProfileRow,
} from './mapSupabaseEcho';

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
    .select('id, author_id, title, prompt, response, likes_count, comment_count, repost_count, view_count, created_at')
    .in('id', ids);
  if (e1) throw e1;
  const rows = (echoes || []) as SupabaseEchoRow[];
  if (!rows.length) return [];

  const authorIds = [...new Set(rows.map(r => r.author_id))];
  const { data: profiles, error: e2 } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_color, is_verified')
    .in('id', authorIds);
  if (e2) throw e2;
  const profileById = new Map((profiles as SupabaseProfileRow[] || []).map(p => [p.id, p]));

  const { data: likeRows } = await supabase.from('echo_likes').select('echo_id').eq('user_id', uid);
  const liked = new Set((likeRows || []).map((r: { echo_id: string }) => r.echo_id));
  const bookmarked = new Set(ids);

  return rows.map(echo =>
    mapEchoRowToFeedItem(echo, profileById.get(echo.author_id), liked, bookmarked)
  );
}

export async function fetchRemoteFeed(): Promise<FeedItem[]> {
  const uid = await getSessionUserId();

  const { data: echoes, error: e1 } = await supabase
    .from('public_echoes')
    .select('id, author_id, title, prompt, response, likes_count, comment_count, repost_count, view_count, created_at')
    .order('created_at', { ascending: false });

  if (e1) throw e1;
  const rows = (echoes || []) as SupabaseEchoRow[];
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map(r => r.author_id))];
  const { data: profiles, error: e2 } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_color, is_verified')
    .in('id', authorIds);

  if (e2) throw e2;
  const profileById = new Map((profiles as SupabaseProfileRow[] || []).map(p => [p.id, p]));

  let liked = new Set<string>();
  let bookmarked = new Set<string>();
  if (uid) {
    const [{ data: likeRows }, { data: bmRows }] = await Promise.all([
      supabase.from('echo_likes').select('echo_id').eq('user_id', uid),
      supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid),
    ]);
    liked = new Set((likeRows || []).map((r: { echo_id: string }) => r.echo_id));
    bookmarked = new Set((bmRows || []).map((r: { echo_id: string }) => r.echo_id));
  }

  return rows.map(echo =>
    mapEchoRowToFeedItem(echo, profileById.get(echo.author_id), liked, bookmarked)
  );
}

export async function insertRemoteEcho(params: {
  authorId: string;
  prompt: string;
  response: string;
  title?: string;
}): Promise<void> {
  const title =
    params.title?.trim() ||
    (params.prompt.trim().slice(0, 80) + (params.prompt.length > 80 ? '…' : ''));
  const { error } = await supabase.from('public_echoes').insert({
    author_id: params.authorId,
    title,
    prompt: params.prompt,
    response: params.response,
  });
  if (error) throw error;
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

export async function fetchRemoteProfile(userId: string): Promise<SupabaseProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_color, is_verified')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as SupabaseProfileRow | null;
}

export async function fetchRemoteEchoesByAuthor(authorId: string): Promise<FeedItem[]> {
  const { data: echoes, error } = await supabase
    .from('public_echoes')
    .select('id, author_id, title, prompt, response, likes_count, comment_count, repost_count, view_count, created_at')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (echoes || []) as SupabaseEchoRow[];
  if (rows.length === 0) return [];

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_color, is_verified')
    .eq('id', authorId)
    .maybeSingle();
  const author = profile as SupabaseProfileRow | null | undefined;

  const uid = await getSessionUserId();
  let liked = new Set<string>();
  let bookmarked = new Set<string>();
  if (uid && rows.length) {
    const ids = rows.map(r => r.id);
    const [{ data: likeRows }, { data: bmRows }] = await Promise.all([
      supabase.from('echo_likes').select('echo_id').eq('user_id', uid).in('echo_id', ids),
      supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid).in('echo_id', ids),
    ]);
    liked = new Set((likeRows || []).map((r: { echo_id: string }) => r.echo_id));
    bookmarked = new Set((bmRows || []).map((r: { echo_id: string }) => r.echo_id));
  }

  return rows.map(echo =>
    mapEchoRowToFeedItem(echo, author || undefined, liked, bookmarked)
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
    .select('id, username, display_name, bio, avatar_color, is_verified')
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
    .select('id, username, display_name, bio, avatar_color, is_verified')
    .in('id', ids);
  if (e2) throw e2;
  return (profiles || []) as SupabaseProfileRow[];
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
