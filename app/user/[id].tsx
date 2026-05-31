import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import {
  ArrowLeft, SealCheck, DotsThreeOutline, Envelope,
  UserMinus, Flag, ShareNetwork, Images,
} from 'phosphor-react-native';
import { ActionSheet, ActionItem } from '../../components/common/ActionSheet';
import { EmptyState } from '../../components/common/EmptyState';
import { FeedCard } from '../../components/social/FeedCard';
import { ThinkingFingerprintCard } from '../../components/social/ThinkingFingerprintCard';
import { ProfileHeaderSkeleton, FeedCardSkeleton } from '../../components/ui/Skeleton';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { useFeed } from '../../hooks/queries/useFeed';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useRemoteProfileBundle } from '../../hooks/queries/useRemoteProfile';
import { useToggleRemoteFollow } from '../../hooks/queries/useSupabaseSocial';
import { useToggleRemoteBlock, useToggleRemoteMute } from '../../hooks/queries/useBlockMute';
import { buildCreatorProfile } from '../../lib/echoUX';

function ProfileHeader({ user, echoeCount, following, blocked, muted, onFollow, onMessage, onReport, onBlock, onMute, showMenu, setShowMenu, isSelf, router, creatorProfile, fingerprintUserId }: any) {
  const { colors, radius, animation, isUserOnline } = useTheme();
  const online = isUserOnline(user.id);
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
    showToast(!following ? `Following @${user.username}` : `Unfollowed @${user.username}`, !following ? '\u{1F91D}' : '');
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
          onPress={() => router.back()}
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
        <AnimatedPressable scaleValue={0.93} haptic="light">
          <View className="relative">
            {user.avatarUrl ? (
              <Image
                source={{ uri: user.avatarUrl }}
                style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 12 }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                className="w-20 h-20 rounded-full items-center justify-center mb-3"
                style={{ backgroundColor: user.avatarColor }}
              >
                <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700' }}>
                  {user.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            {online && (
              <View className="absolute bottom-3 right-0 w-4 h-4 rounded-full" style={{ backgroundColor: colors.success, borderWidth: 2.5, borderColor: colors.bg }} />
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
              <View key={topic} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.accentMuted }}>
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>#{topic}</Text>
              </View>
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
          <View className="flex-row gap-3">
            <Animated.View style={followAnim} className="flex-1">
              <AnimatedPressable
                onPress={handleFollow}
                className="py-2.5 items-center"
                style={{
                  borderRadius: radius.lg,
                  backgroundColor: following ? colors.surfaceHover : colors.accent,
                  borderWidth: following ? 1 : 0,
                  borderColor: colors.border,
                }}
                scaleValue={0.96}
                haptic="medium"
              >
                <Text style={{ fontWeight: '600', color: colors.text }}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </AnimatedPressable>
            </Animated.View>
            <AnimatedPressable onPress={onMessage} className="py-2.5 px-4" style={{ borderRadius: radius.lg, backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.border }} scaleValue={0.92} haptic="light">
              <Envelope color={colors.text} size={20} />
            </AnimatedPressable>
            <AnimatedPressable className="py-2.5 px-4" style={{ borderRadius: radius.lg, backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.border }} scaleValue={0.92} haptic="light">
              <ShareNetwork color={colors.text} size={20} />
            </AnimatedPressable>
          </View>
        )}
      </Animated.View>

      {fingerprintUserId ? <ThinkingFingerprintCard userId={fingerprintUserId} isSelf={isSelf} /> : null}

      <View className="mx-4 mb-2" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, marginBottom: 8 }}>
        Echoes {'\u00B7'} {echoeCount}
      </Text>
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
  const { colors } = useTheme();

  const {
    getUser, isFollowing, toggleFollow, isBlocked, toggleBlock, isMuted, toggleMute, getOrCreateConversation,
  } = useAppStore();
  const { data: feed } = useFeed();
  const [showMenu, setShowMenu] = useState(false);

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
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} className="items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>User not found</Text>
          <AnimatedPressable onPress={() => router.back()} className="mt-4" scaleValue={0.95} haptic="light">
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
              onMessage={() => { const convId = getOrCreateConversation(user); router.push(`/messages/${convId}`); }}
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
        <AnimatedPressable onPress={() => router.back()} className="mt-4" scaleValue={0.95} haptic="light">
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
            onMessage={() => { const convId = getOrCreateConversation(user); router.push(`/messages/${convId}`); }}
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
        ListEmptyComponent={<View className="items-center pt-12"><Text style={{ color: colors.textMuted }}>No echoes yet</Text></View>}
      />
    </SafeAreaView>
  );
}
