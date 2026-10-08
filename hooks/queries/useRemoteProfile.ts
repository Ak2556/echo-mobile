import { useQuery } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/core/remoteConfig';
import {
  fetchRemoteEchoById,
  fetchRemoteEchoesByAuthor,
  fetchRemoteFollowingCount,
  fetchRemoteProfile,
  getSessionUserId,
  isRemoteFollowing,
  isRemoteFollowRequested,
} from '../../lib/supabaseEchoApi';
import { FeedItem, User } from '../../types';
import { SupabaseProfileRow } from '../../lib/feed/mapSupabaseEcho';

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
    avatarUrl: p.avatar_url ?? undefined,
    bio: p.bio ?? '',
    isVerified: p.is_verified,
    followerCount,
    followingCount,
    echoCount,
    createdAt: p.created_at,
    isPrivate: p.is_private === true,
  };
}

const PROFILE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function useRemoteProfileBundle(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId && isSupabaseRemote(),
    staleTime: 1000 * 30,
    queryFn: async (): Promise<{
      user: User;
      echoes: FeedItem[];
      isFollowing: boolean;
      isRequested: boolean;
      isSelf: boolean;
      pinnedEcho: FeedItem | null;
    } | null> => {
      if (!userId) return null;
      let targetId = userId;
      if (userId === 'me') {
        const uid = await getSessionUserId();
        if (!uid) return null;
        targetId = uid;
      }
      // The profile screen used to wait through five requests in a row (profile,
      // echoes, the author again, viewer state, then "do I follow them"). They
      // need only the profile id, so with an id in hand they all go at once and
      // the screen waits for the slowest, not the sum. The follower count is on
      // the profile row, so it costs no request at all.
      const sessionUid = await getSessionUserId(); // local read, no network
      const idKnown = PROFILE_ID_RE.test(targetId);
      const profilePromise = fetchRemoteProfile(targetId);
      const following = (id: string) => (sessionUid && sessionUid !== id ? isRemoteFollowing(id) : Promise.resolve(false));
      // Asked in the same breath: a request is a row nobody else can see, so it is one more
      // primary-key read, not a second round trip.
      const requested = (id: string) => (sessionUid && sessionUid !== id ? isRemoteFollowRequested(id) : Promise.resolve(false));

      let profile: Awaited<typeof profilePromise>;
      let echoes: FeedItem[];
      let followingCount: number;
      let isFollowing: boolean;
      let isRequested: boolean;
      if (idKnown) {
        [profile, echoes, followingCount, isFollowing, isRequested] = await Promise.all([
          profilePromise,
          fetchRemoteEchoesByAuthor(targetId, profilePromise),
          fetchRemoteFollowingCount(targetId),
          following(targetId),
          requested(targetId),
        ]);
        if (!profile) return null;
      } else {
        // A username, not an id: the id is only known once the profile is back.
        profile = await profilePromise;
        if (!profile) return null;
        [echoes, followingCount, isFollowing, isRequested] = await Promise.all([
          fetchRemoteEchoesByAuthor(profile.id, profile),
          fetchRemoteFollowingCount(profile.id),
          following(profile.id),
          requested(profile.id),
        ]);
      }
      const profileId = profile.id;
      const followerCount = profile.follower_count ?? 0;
      const isSelf = sessionUid === profileId;
      // Resolve the pinned echo if any. Use a local list first to avoid an
      // extra round-trip when the pin is one of the most recent echoes.
      let pinnedEcho: FeedItem | null = null;
      if (profile.pinned_echo_id) {
        pinnedEcho = echoes.find(e => e.id === profile.pinned_echo_id) ?? null;
        if (!pinnedEcho) {
          pinnedEcho = await fetchRemoteEchoById(profile.pinned_echo_id).catch(() => null);
        }
      }
      const user = profileRowToUser(profile, echoes.length, followerCount, followingCount);
      return { user, echoes, isFollowing, isRequested, isSelf, pinnedEcho };
    },
  });
}
