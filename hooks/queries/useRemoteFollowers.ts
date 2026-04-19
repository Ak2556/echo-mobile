import { useQuery } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchRemoteFollowers, fetchRemoteFollowingProfiles } from '../../lib/supabaseEchoApi';
import { User } from '../../types';
import { SupabaseProfileRow } from '../../lib/mapSupabaseEcho';

function rowsToUsers(rows: SupabaseProfileRow[]): User[] {
  return rows.map(p => ({
    id: p.id,
    username: p.username,
    displayName: p.display_name || p.username,
    avatarColor: p.avatar_color || '#3B82F6',
    bio: p.bio ?? '',
    isVerified: p.is_verified,
    followerCount: 0,
    followingCount: 0,
    echoCount: 0,
    createdAt: new Date().toISOString(),
  }));
}

export function useRemoteFollowersList(
  targetUserId: string | undefined,
  tab: 'followers' | 'following'
) {
  return useQuery({
    queryKey: ['followers', targetUserId, tab],
    enabled: !!targetUserId && isSupabaseRemote(),
    queryFn: async (): Promise<User[]> => {
      if (!targetUserId) return [];
      const rows =
        tab === 'followers'
          ? await fetchRemoteFollowers(targetUserId)
          : await fetchRemoteFollowingProfiles(targetUserId);
      return rowsToUsers(rows);
    },
  });
}
