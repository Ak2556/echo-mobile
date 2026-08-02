import { useQuery } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import {
  fetchRemoteFollowers,
  fetchRemoteFollowingProfiles,
  fetchMyFollowSets,
} from '../../lib/supabaseEchoApi';
import { User } from '../../types';
import { SupabaseProfileRow } from '../../lib/mapSupabaseEcho';

// A user in a followers/following list, annotated with the viewer's relationship:
//   isFollowing — the viewer follows this user
//   followsYou  — this user follows the viewer (drives the "Follows you" badge)
export type ConnectionUser = User & { isFollowing: boolean; followsYou: boolean };

function rowsToConnections(
  rows: SupabaseProfileRow[],
  followingSet: Set<string>,
  followerSet: Set<string>,
): ConnectionUser[] {
  return rows.map(p => ({
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
    createdAt: new Date().toISOString(),
    isFollowing: followingSet.has(p.id),
    followsYou: followerSet.has(p.id),
  }));
}

export function useRemoteFollowersList(
  targetUserId: string | undefined,
  tab: 'followers' | 'following'
) {
  return useQuery({
    queryKey: ['followers', targetUserId, tab],
    enabled: !!targetUserId && isSupabaseRemote(),
    staleTime: 1000 * 30,
    queryFn: async (): Promise<ConnectionUser[]> => {
      if (!targetUserId) return [];
      const [rows, sets] = await Promise.all([
        tab === 'followers'
          ? fetchRemoteFollowers(targetUserId)
          : fetchRemoteFollowingProfiles(targetUserId),
        fetchMyFollowSets(),
      ]);
      return rowsToConnections(rows, new Set(sets.following), new Set(sets.followers));
    },
  });
}
