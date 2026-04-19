import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, Bookmark } from 'lucide-react-native';
import { FeedCard } from '../components/social/FeedCard';
import { EmptyState } from '../components/common/EmptyState';
import { useAppStore } from '../store/useAppStore';
import { useFeed } from '../hooks/queries/useFeed';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { useRemoteBookmarks } from '../hooks/queries/useRemoteBookmarks';

export default function BookmarksScreen() {
  const router = useRouter();
  const remote = isSupabaseRemote();
  const { bookmarkedIds } = useAppStore();
  const { data: feed } = useFeed();
  const remoteQ = useRemoteBookmarks();

  const bookmarked = remote
    ? (remoteQ.data ?? [])
    : (feed || []).filter(item => bookmarkedIds.includes(item.id));

  const loading = remote && remoteQ.isPending;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="flex-row items-center px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <Text className="text-white font-bold text-lg">Bookmarks</Text>
        <View className="flex-1" />
        <Text className="text-zinc-500 text-sm">{bookmarked.length}</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#3B82F6" size="large" />
        </View>
      ) : bookmarked.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks yet"
          subtitle="Save echoes you want to revisit later by tapping the bookmark icon."
          actionLabel="Explore"
          onAction={() => router.push('/(tabs)/discover')}
        />
      ) : (
        <FlashList
          data={bookmarked}
          renderItem={({ item, index }) => (
            <FeedCard item={item} index={index} onPress={() => router.push(`/thread/${item.id}`)} />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
        />
      )}
    </SafeAreaView>
  );
}
