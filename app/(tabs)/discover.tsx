// @ts-nocheck
import React, { useCallback } from 'react';
import { View, Text, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { Plus } from 'lucide-react-native';
import { FeedCard } from '../../components/social/FeedCard';
import { StoryCircles } from '../../components/social/StoryCircles';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { useFeed } from '../../hooks/queries/useFeed';
import { FeedItem } from '../../types';
import { useTheme } from '../../lib/theme';

export default function DiscoverScreen() {
  const router = useRouter();
  const { data: feed, isLoading, refetch, isRefetching } = useFeed();
  const { colors, radius, animation } = useTheme();

  const handlePressThread = useCallback((item: FeedItem) => {
    router.push(`/thread/${item.id}`);
  }, [router]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {isLoading ? (
        <Animated.View entering={animation(FadeIn.duration(300))} style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>Echo</Text>
          </View>
          <StoryCircles />
          <View style={{ height: 8 }} />
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
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>Echo</Text>
                <Pressable
                  onPress={() => router.push('/create-post')}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Plus color="#fff" size={20} strokeWidth={2.5} />
                </Pressable>
              </View>
              <StoryCircles />
              <View style={{ height: 8 }} />
            </View>
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>No echoes yet</Text>
            </View>
          }
        />
      )}

      {/* Floating Action Button */}
      <Animated.View
        entering={animation(FadeInUp.delay(300).springify())}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 20,
        }}
      >
        <Pressable
          onPress={() => router.push('/create-post')}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.accent,
            shadowOpacity: 0.45,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
        >
          <Plus color="#fff" size={26} strokeWidth={2.5} />
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}
