import { useQuery } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import {
  fetchRemoteEchoesByAuthor,
  fetchRemoteFollowersCount,
  fetchRemoteFollowingCount,
  fetchRemoteProfile,
  getSessionUserId,
  isRemoteFollowing,
} from '../../lib/supabaseEchoApi';
import { FeedItem, User } from '../../types';
import { SupabaseProfileRow } from '../../lib/mapSupabaseEcho';

function profileRowToUser(
  p: SupabaseProfileRow,
  echoCount: number,
  followerCount: number,
  followingCount: number
): User {
  return {
    id: p.id,
    username: p.username,
    displayName: p.display_name || p.username,
    avatarColor: p.avatar_color || '#3B82F6',
    bio: p.bio ?? '',
    isVerified: p.is_verified,
    followerCount,
    followingCount,
    echoCount,
    createdAt: new Date().toISOString(),
  };
}

export function useRemoteProfileBundle(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId && isSupabaseRemote(),
    queryFn: async (): Promise<{
      user: User;
      echoes: FeedItem[];
      isFollowing: boolean;
      isSelf: boolean;
    } | null> => {
      if (!userId) return null;
      const profile = await fetchRemoteProfile(userId);
      if (!profile) return null;
      const [echoes, followerCount, followingCount, sessionUid] = await Promise.all([
        fetchRemoteEchoesByAuthor(userId),
        fetchRemoteFollowersCount(userId),
        fetchRemoteFollowingCount(userId),
        getSessionUserId(),
      ]);
      const isSelf = sessionUid === userId;
      const isFollowing = sessionUid && !isSelf ? await isRemoteFollowing(userId) : false;
      const user = profileRowToUser(profile, echoes.length, followerCount, followingCount);
      return { user, echoes, isFollowing, isSelf };
    },
  });
}
