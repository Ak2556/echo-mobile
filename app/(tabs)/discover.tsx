// @ts-nocheck
import React, { useCallback } from 'react';
import { View, Text, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { FeedCard } from '../../components/social/FeedCard';
import { StoryCircles } from '../../components/social/StoryCircles';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { useFeed } from '../../hooks/queries/useFeed';
import { FeedItem } from '../../types';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../lib/theme';

export default function DiscoverScreen() {
  const router = useRouter();
  const { data: feed, isLoading, refetch, isRefetching } = useFeed();
  const { colors, animation } = useTheme();

  const handlePressThread = useCallback((item: FeedItem) => {
    router.push(`/thread/${item.id}`);
  }, [router]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {isLoading ? (
        <Animated.View entering={animation(FadeIn.duration(300))} className="flex-1">
          <View className="px-4 pt-3 pb-3">
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>Echo</Text>
          </View>
          <StoryCircles />
          <View className="h-2" />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </Animated.View>
      ) : (
        <FlashList
          data={feed}
          renderItem={({ item, index }) => (
            <FeedCard item={item} index={index} onPress={() => handlePressThread(item)} />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View>
              <View className="px-4 pt-3 pb-3">
                <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>Echo</Text>
              </View>
              <StoryCircles />
              <View className="h-2" />
            </View>
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-20">
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>No echoes yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
