import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, BookmarkSimple } from 'phosphor-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FeedCard } from '../components/social/FeedCard';
import { FeedCardSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { useFeed } from '../hooks/queries/useFeed';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { useRemoteBookmarks } from '../hooks/queries/useRemoteBookmarks';

export default function BookmarksScreen() {
  const router = useRouter();
  const remote = isSupabaseRemote();
  const { bookmarkedIds } = useAppStore();
  const { data: feed } = useFeed();
  const remoteQ = useRemoteBookmarks();
  const { colors, animation } = useTheme();

  const bookmarked = remote
    ? (remoteQ.data ?? [])
    : (feed || []).filter(item => bookmarkedIds.includes(item.id));

  const loading = remote && remoteQ.isPending;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} className="p-1 mr-3" scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Bookmarks</Text>
        <View className="flex-1" />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>{bookmarked.length}</Text>
      </View>

      {loading ? (
        <Animated.View entering={animation(FadeIn.duration(300))} className="pt-2">
          <FeedCardSkeleton />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </Animated.View>
      ) : bookmarked.length === 0 ? (
        <EmptyState
          icon={BookmarkSimple}
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
