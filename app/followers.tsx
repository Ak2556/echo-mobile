import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Users } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { UserRow } from '../components/social/UserRow';
import { UserRowSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState, classifyError } from '../components/common/ErrorState';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { useRemoteFollowersList } from '../hooks/queries/useRemoteFollowers';

export default function FollowersScreen() {
  const router = useRouter();
  const { tab: initialTab, userId: paramUserId } = useLocalSearchParams<{ userId?: string; tab?: string }>();
  const storeUserId = useAppStore(s => s.userId);
  const targetUserId = paramUserId || storeUserId;
  const { colors } = useTheme();

  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(
    initialTab === 'following' ? 'following' : 'followers'
  );

  const remote = isSupabaseRemote();
  const followersRemote = useRemoteFollowersList(remote ? targetUserId : undefined, 'followers');
  const followingRemote = useRemoteFollowersList(remote ? targetUserId : undefined, 'following');

  const { getFollowers, getFollowing } = useAppStore();
  const followersLocal = getFollowers();
  const followingLocal = getFollowing();

  const data = remote
    ? (activeTab === 'followers' ? followersRemote.data : followingRemote.data) ?? []
    : activeTab === 'followers'
      ? followersLocal
      : followingLocal;

  const loading = remote && (followersRemote.isPending || followingRemote.isPending);
  const activeQuery = activeTab === 'followers' ? followersRemote : followingRemote;
  const showError = remote && activeQuery.isError && data.length === 0;

  const followersCount = remote ? (followersRemote.data?.length ?? 0) : followersLocal.length;
  const followingCount = remote ? (followingRemote.data?.length ?? 0) : followingLocal.length;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Connections" />

      <View className="flex-row" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {(['followers', 'following'] as const).map(tab => (
          <AnimatedPressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            performanceMode="hot"
            className="flex-1 py-3 items-center"
            style={{
              borderBottomWidth: 2,
              borderBottomColor: activeTab === tab ? colors.accent : 'transparent',
            }}
            scaleValue={0.97}
            haptic="light"
          >
            <Text
              style={{
                color: activeTab === tab ? colors.text : colors.textMuted,
                fontWeight: '600',
                textTransform: 'capitalize',
              }}
            >
              {tab} ({tab === 'followers' ? followersCount : followingCount})
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      {loading ? (
        <View className="pt-2">
          <UserRowSkeleton />
          <UserRowSkeleton />
          <UserRowSkeleton />
          <UserRowSkeleton />
        </View>
      ) : showError ? (
        <ErrorState kind={classifyError(activeQuery.error)} onRetry={() => activeQuery.refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<Users color={colors.accent} size={32} />}
          title={activeTab === 'followers' ? 'No followers yet' : 'Not following anyone'}
          subtitle={activeTab === 'followers'
            ? 'Share great echoes and people will follow you!'
            : 'Explore and follow people whose echoes inspire you.'}
        />
      ) : (
        <FlashList
          data={data}
          renderItem={({ item }) => (
            <UserRow
              user={item}
              onPress={() => router.push(`/user/${item.id}`)}
              showFollowButton={!remote}
            />
          )}
          keyExtractor={item => item.id}
        />
      )}
    </SafeAreaView>
  );
}
