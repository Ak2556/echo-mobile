import React, { useState } from 'react';
import { Share, View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { safeBack } from '../../lib/safeBack';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import {
  ArrowLeft, SealCheck, DotsThreeOutline, Envelope,
  UserMinus, Flag, ShareNetwork, Images, Compass, Users, PencilSimple, ChatTeardropDots,
} from 'phosphor-react-native';
import { ActionSheet, ActionItem } from '../../components/common/ActionSheet';
import { ConnectionPanel } from '../../components/common/ConnectionPanel';
import { EmptyState } from '../../components/common/EmptyState';
import { FeedCard } from '../../components/social/FeedCard';
import { ThinkingFingerprintCard } from '../../components/social/ThinkingFingerprintCard';
import { ProfileHeaderSkeleton, FeedCardSkeleton } from '../../components/ui/Skeleton';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { ProfilePhotoPreview } from '../../components/ui/ProfilePhotoPreview';
import { showToast } from '../../components/ui/Toast';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { useFeed } from '../../hooks/queries/useFeed';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useRemoteProfileBundle } from '../../hooks/queries/useRemoteProfile';
import { useToggleRemoteFollow } from '../../hooks/queries/useSupabaseSocial';
import { useToggleRemoteBlock, useToggleRemoteMute } from '../../hooks/queries/useBlockMute';
import { useStartRemoteConversation } from '../../hooks/queries/useDMs';
import { buildCreatorProfile } from '../../lib/echoUX';
import { userUrl } from '../../lib/echoUrl';

function ProfileHeader({ user, echoeCount, following, blocked, muted, onFollow, onMessage, messageLoading, onReport, onBlock, onMute, onShare, showMenu, setShowMenu, isSelf, router, creatorProfile, fingerprintUserId }: any) {
  const { colors, radius, animation, isUserOnline } = useTheme();
  const online = isUserOnline(user.id);
  const primaryTopic = creatorProfile?.topics?.[0];
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const followScale = useSharedValue(1);
  const followAnim = useAnimatedStyle(() => ({
    transform: [{ scale: followScale.value }],
  }));

  const handleFollow = () => {
    followScale.value = withSequence(
      withSpring(0.9, { damping: 10, stiffness: 400 }),
      withSpring(1.05, { damping: 10, stiffness: 300 }),
      withSpring(1, { damping: 12, stiffness: 300 })
    );
    onFollow();
    showToast(!following ? `Following @${user.username}` : `Unfollowed @${user.username}`, !following ? 'Following' : '');
  };

  const menuActions: ActionItem[] = [
    ...(!isSelf ? [{
      key: 'mute',
      label: muted ? 'Unmute' : 'Mute',
      icon: <UserMinus color={colors.textSecondary} size={20} />,
      onPress: onMute,
    }, {
      key: 'block',
      label: blocked ? 'Unblock' : 'Block',
      icon: <UserMinus color={colors.danger} size={20} />,
      destructive: !blocked,
      onPress: onBlock,
    }] : []),
    {
      key: 'report',
      label: 'Report',
      icon: <Flag color="#F59E0B" size={20} weight="fill" />,
      destructive: true,
      onPress: onReport,
    },
  ];

  return (
    <View>
      <View className="flex-row items-center justify-between px-4 py-2">
        <AnimatedPressable
          onPress={() => safeBack()}
          className="p-1"
          scaleValue={0.88}
          haptic="light"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => setShowMenu(true)}
          className="p-1"
          scaleValue={0.88}
          haptic="light"
          accessibilityLabel="Profile options"
          accessibilityHint="Opens block, mute, and report menu"
        >
          <DotsThreeOutline color={colors.text} size={24} />
        </AnimatedPressable>
      </View>

      <ActionSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        subtitle={`@${user.username}`}
        actions={menuActions}
      />

      <Animated.View entering={animation(FadeInDown.delay(100).duration(220))} className="items-center px-4 pt-2 pb-4">
        <AnimatedPressable
          onPress={() => user.avatarUrl ? setPhotoPreviewOpen(true) : undefined}
          disabled={!user.avatarUrl}
          accessibilityRole={user.avatarUrl ? 'button' : undefined}
          accessibilityLabel={user.avatarUrl ? 'Open profile photo' : undefined}
          style={{ marginBottom: 12 }}
          scaleValue={0.93}
          haptic="light"
        >
          <View className="relative">
            <ProfileAvatar
              displayName={user.displayName}
              avatarColor={user.avatarColor}
              avatarUrl={user.avatarUrl}
              size={82}
              isVerified={false}
            />
            {online && (
              <View className="absolute bottom-3 right-1 w-4 h-4 rounded-full" style={{ backgroundColor: colors.success, borderWidth: 2.5, borderColor: colors.bg }} />
            )}
          </View>
        </AnimatedPressable>
        <View className="flex-row items-center gap-1.5 mb-1">
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{user.displayName}</Text>
          {user.isVerified && <SealCheck color={colors.accent} size={20} weight="fill" />}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 8 }}>@{user.username}</Text>
        {online && <Text style={{ color: colors.success, fontSize: 12, marginBottom: 8 }}>Active now</Text>}
        {user.bio ? <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 14, marginBottom: 16 }}>{user.bio}</Text> : null}
        {creatorProfile?.topics?.length ? (
          <View className="flex-row flex-wrap justify-center gap-2 mb-4">
            {creatorProfile.topics.map((topic: string) => (
              <AnimatedPressable
                key={topic}
                onPress={() => router.push({ pathname: '/(tabs)/explore', params: { q: topic } })}
                accessibilityRole="button"
                accessibilityLabel={`Explore ${topic}`}
                scaleValue={0.94}
                haptic="light"
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.accentMuted }}
              >
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>#{topic}</Text>
              </AnimatedPressable>
            ))}
          </View>
        ) : null}

        <View className="flex-row gap-8 mb-4">
          <AnimatedPressable className="items-center" scaleValue={0.92} haptic="light">
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>{echoeCount}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Echoes</Text>
          </AnimatedPressable>
          <AnimatedPressable onPress={() => router.push({ pathname: '/followers', params: { userId: user.id, tab: 'followers' } })} className="items-center" scaleValue={0.92} haptic="light">
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>{user.followerCount}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Followers</Text>
          </AnimatedPressable>
          <AnimatedPressable onPress={() => router.push({ pathname: '/followers', params: { userId: user.id, tab: 'following' } })} className="items-center" scaleValue={0.92} haptic="light">
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>{user.followingCount}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Following</Text>
          </AnimatedPressable>
        </View>

        {!isSelf && (
          <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', paddingHorizontal: 16 }}>
            <Animated.View style={[followAnim, { flex: 1 }]}>
              <AnimatedPressable
                onPress={handleFollow}
                style={{
                  paddingVertical: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.lg,
                  backgroundColor: following ? colors.surfaceHover : colors.accent,
                  borderWidth: following ? 1 : 0,
                  borderColor: colors.border,
                }}
                scaleValue={0.96}
                haptic="medium"
              >
                <Text style={{ fontWeight: '700', fontSize: 15, color: following ? colors.text : '#fff' }}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </AnimatedPressable>
            </Animated.View>
            <AnimatedPressable
              onPress={onMessage}
              disabled={messageLoading}
              style={{ width: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.border, opacity: messageLoading ? 0.55 : 1 }}
              scaleValue={0.92}
              haptic="light"
            >
              <Envelope color={colors.text} size={20} />
            </AnimatedPressable>
            <AnimatedPressable
              onPress={onShare}
              style={{ width: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.border }}
              scaleValue={0.92}
              haptic="light"
            >
              <ShareNetwork color={colors.text} size={20} />
            </AnimatedPressable>
          </View>
        )}
      </Animated.View>

      {fingerprintUserId ? <ThinkingFingerprintCard userId={fingerprintUserId} isSelf={isSelf} /> : null}

      <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
        <ConnectionPanel
          actions={[
            // Message lives in the primary action row above (the envelope
            // button), so it isn't repeated here; self gets Edit profile.
            ...(isSelf ? [{
              key: 'edit',
              label: 'Edit profile',
              icon: <PencilSimple color={colors.textSecondary} size={18} />,
              onPress: () => router.push('/edit-profile'),
              emphasis: 'primary' as const,
            }] : []),
            ...(primaryTopic ? [{
              key: 'topic',
              label: `Explore #${primaryTopic}`,
              icon: <Compass color={colors.textSecondary} size={18} />,
              onPress: () => router.push({ pathname: '/(tabs)/explore', params: { q: primaryTopic } }),
            }] : []),
            {
              key: 'followers',
              label: 'Followers',
              icon: <Users color={colors.textSecondary} size={18} />,
              onPress: () => router.push({ pathname: '/followers', params: { userId: user.id, tab: 'followers' } }),
            },
            {
              key: 'thinking',
              label: 'Thinking partners',
              icon: <ChatTeardropDots color={colors.textSecondary} size={18} />,
              onPress: () => router.push('/thinking-partners'),
            },
          ]}
        />
      </View>

      <View className="mx-4 mb-2" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', paddingHorizontal: 16, marginBottom: 8 }}>
        Echoes {'\u00B7'} {echoeCount}
      </Text>
      <ProfilePhotoPreview
        visible={photoPreviewOpen}
        imageUrl={user.avatarUrl}
        displayName={user.displayName}
        onClose={() => setPhotoPreviewOpen(false)}
      />
    </View>
  );
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const remote = isSupabaseRemote();
  const remoteBundle = useRemoteProfileBundle(remote ? id : undefined);
  const followMut = useToggleRemoteFollow();
  const blockMut = useToggleRemoteBlock();
  const muteMut = useToggleRemoteMute();
  const startConvMut = useStartRemoteConversation();
  const { colors } = useTheme();

  const {
    getUser, isFollowing, toggleFollow, isBlocked, toggleBlock, isMuted, toggleMute, getOrCreateConversation,
  } = useAppStore();
  const { data: feed } = useFeed();
  const [showMenu, setShowMenu] = useState(false);

  const openDirectMessage = async (targetUser: any) => {
    if (!targetUser?.id || startConvMut.isPending) return;
    try {
      if (remote) {
        const convId = await startConvMut.mutateAsync(targetUser.id);
        router.push(`/messages/${convId}`);
        return;
      }
      const convId = getOrCreateConversation(targetUser);
      router.push(`/messages/${convId}`);
    } catch {
      showToast('Could not open messages', 'Error');
    }
  };

  if (remote) {
    if (remoteBundle.isPending) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <ProfileHeaderSkeleton />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </SafeAreaView>
      );
    }
    if (!remoteBundle.data) {
      // Distinguish a fetch failure from a genuinely missing profile —
      // showing "not found" for a network/RLS error sent us debugging the
      // wrong thing entirely.
      const errMessage = remoteBundle.error
        ? (remoteBundle.error as Error).message || 'Something went wrong loading this profile.'
        : null;
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} className="items-center justify-center">
          <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
            {errMessage ? `Couldn't load profile\n${errMessage}` : 'User not found'}
          </Text>
          {errMessage ? (
            <AnimatedPressable onPress={() => remoteBundle.refetch()} className="mt-4" scaleValue={0.95} haptic="light">
              <Text style={{ color: colors.accent }}>Retry</Text>
            </AnimatedPressable>
          ) : null}
          <AnimatedPressable onPress={() => safeBack()} className="mt-4" scaleValue={0.95} haptic="light">
            <Text style={{ color: colors.accent }}>Go Back</Text>
          </AnimatedPressable>
        </SafeAreaView>
      );
    }

    const { user, echoes, isFollowing: remoteFollowing, isSelf, pinnedEcho } = remoteBundle.data;
    const blocked = isBlocked(user.id);
    const muted = isMuted(user.id);
    const creatorProfile = buildCreatorProfile(user, echoes);
    // Hoist the pinned echo to the top of the list, deduped against the
    // regular reverse-chron echoes so it doesn't render twice.
    const orderedEchoes = pinnedEcho
      ? [pinnedEcho, ...echoes.filter(e => e.id !== pinnedEcho.id)]
      : echoes;

    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <FlashList
          data={orderedEchoes}
          renderItem={({ item, index }) => (
            <FeedCard
              item={item}
              index={index}
              pinned={pinnedEcho?.id === item.id}
              onPress={() => router.push(`/thread/${item.id}`)}
            />
          )}
          keyExtractor={item => item.id}
          ListHeaderComponent={
            <ProfileHeader
              user={user}
              echoeCount={echoes.length}
              following={remoteFollowing}
              blocked={blocked}
              muted={muted}
              onFollow={() => followMut.mutate({ userId: user.id, follow: !remoteFollowing })}
              onMessage={() => { void openDirectMessage(user); }}
              messageLoading={startConvMut.isPending}
              onShare={() => { void Share.share({ message: userUrl(user.username), url: userUrl(user.username) }); }}
              onReport={() => router.push({ pathname: '/report', params: { targetType: 'user', targetId: user.id, targetName: user.username } })}
              onMute={() => {
                if (remote) {
                  muteMut.mutate({ targetUserId: user.id, mute: !muted });
                } else {
                  toggleMute(user.id);
                }
              }}
              onBlock={() => {
                Alert.alert(blocked ? 'Unblock User' : 'Block User',
                  blocked ? `Unblock @${user.username}?` : `Block @${user.username}?`,
                  [{ text: 'Cancel', style: 'cancel' }, {
                    text: blocked ? 'Unblock' : 'Block',
                    style: 'destructive',
                    onPress: () => {
                      if (remote) {
                        blockMut.mutate({ targetUserId: user.id, block: !blocked });
                      } else {
                        toggleBlock(user.id);
                      }
                    },
                  }]);
              }}
              showMenu={showMenu}
              setShowMenu={setShowMenu}
              isSelf={isSelf}
              router={router}
              creatorProfile={creatorProfile}
              fingerprintUserId={user.id}
            />
          }
          ListEmptyComponent={
            <View style={{ paddingTop: 56 }}>
              <EmptyState
                icon={<Images color={colors.accent} size={28} weight="duotone" />}
                title="No echoes yet"
                subtitle="When they publish, you’ll see it here."
              />
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  const user = id ? getUser(id) : undefined;
  const following = id ? isFollowing(id) : false;
  const blocked = id ? isBlocked(id) : false;
  const muted = id ? isMuted(id) : false;
  const userEchoes = (feed || []).filter(item => item.username === user?.username);
  const creatorProfile = user ? buildCreatorProfile(user, userEchoes) : null;

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} className="items-center justify-center">
        <Text style={{ color: colors.textSecondary }}>User not found</Text>
        <AnimatedPressable onPress={() => safeBack()} className="mt-4" scaleValue={0.95} haptic="light">
          <Text style={{ color: colors.accent }}>Go Back</Text>
        </AnimatedPressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlashList
        data={userEchoes}
        renderItem={({ item, index }) => (
          <FeedCard item={item} index={index} onPress={() => router.push(`/thread/${item.id}`)} />
        )}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <ProfileHeader
            user={user}
            echoeCount={user.echoCount}
            following={following}
            blocked={blocked}
            muted={muted}
            onFollow={() => toggleFollow(user.id)}
            onMessage={() => { void openDirectMessage(user); }}
            messageLoading={startConvMut.isPending}
            onShare={() => { void Share.share({ message: userUrl(user.username), url: userUrl(user.username) }); }}
            onReport={() => router.push({ pathname: '/report', params: { targetType: 'user', targetId: user.id, targetName: user.username } })}
            onMute={() => toggleMute(user.id)}
            onBlock={() => {
              Alert.alert(blocked ? 'Unblock User' : 'Block User',
                blocked ? `Unblock @${user.username}?` : `Block @${user.username}?`,
                [{ text: 'Cancel', style: 'cancel' }, { text: blocked ? 'Unblock' : 'Block', style: 'destructive', onPress: () => toggleBlock(user.id) }]);
            }}
            showMenu={showMenu}
            setShowMenu={setShowMenu}
            isSelf={false}
            router={router}
            creatorProfile={creatorProfile}
          />
        }
        ListEmptyComponent={
          <View style={{ paddingTop: 40 }}>
            <EmptyState
              icon={<Images color={colors.accent} size={28} weight="duotone" />}
              title="No echoes yet"
              subtitle="When they publish, you’ll see it here."
            />
          </View>
        }
      />
    </SafeAreaView>
  );
}
