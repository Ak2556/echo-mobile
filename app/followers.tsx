import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, Users } from 'lucide-react-native';
import { UserRow } from '../components/social/UserRow';
import { EmptyState } from '../components/common/EmptyState';
import { useAppStore } from '../store/useAppStore';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { useRemoteFollowersList } from '../hooks/queries/useRemoteFollowers';

export default function FollowersScreen() {
  const router = useRouter();
  const { tab: initialTab, userId: paramUserId } = useLocalSearchParams<{ userId?: string; tab?: string }>();
  const storeUserId = useAppStore(s => s.userId);
  const targetUserId = paramUserId || storeUserId;

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

  const followersCount = remote ? (followersRemote.data?.length ?? 0) : followersLocal.length;
  const followingCount = remote ? (followingRemote.data?.length ?? 0) : followingLocal.length;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="flex-row items-center px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <Text className="text-white font-bold text-lg">Connections</Text>
      </View>

      <View className="flex-row border-b border-zinc-900">
        {(['followers', 'following'] as const).map(tab => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-3 items-center border-b-2 ${
              activeTab === tab ? 'border-blue-500' : 'border-transparent'
            }`}
          >
            <Text className={`font-semibold capitalize ${
              activeTab === tab ? 'text-white' : 'text-zinc-500'
            }`}>
              {tab} ({tab === 'followers' ? followersCount : followingCount})
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center pt-20">
          <ActivityIndicator color="#3B82F6" size="large" />
        </View>
      ) : data.length === 0 ? (
        <EmptyState
          icon={Users}
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
