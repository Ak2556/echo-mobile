// @ts-nocheck
import React, { useCallback } from 'react';
import { View, Text, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { Plus } from 'phosphor-react-native';
import { FeedCard } from '../../components/social/FeedCard';
import { StoryCircles } from '../../components/social/StoryCircles';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { useFeed } from '../../hooks/queries/useFeed';
import { FeedItem } from '../../types';
import { useTheme } from '../../lib/theme';

function DiscoverHeader({ onCreatePress }: { onCreatePress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <GlassPanel
      borderRadius={20}
      style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 8 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }}>
          Echo
        </Text>
        <Pressable
          onPress={onCreatePress}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus color="#fff" size={18} />
        </Pressable>
      </View>
    </GlassPanel>
  );
}

export default function DiscoverScreen() {
  const router = useRouter();
  const { data: feed, isLoading, refetch, isRefetching } = useFeed();
  const { colors, radius, animation } = useTheme();

  const handlePressThread = useCallback((item: FeedItem) => {
    router.push(`/thread/${item.id}`);
  }, [router]);

  const handleCreatePress = useCallback(() => router.push('/create-post'), [router]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {isLoading ? (
        <Animated.View entering={animation(FadeIn.duration(300))} style={{ flex: 1 }}>
          <DiscoverHeader onCreatePress={handleCreatePress} />
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
          contentContainerStyle={{ paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View>
              <DiscoverHeader onCreatePress={handleCreatePress} />
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
    </SafeAreaView>
  );
}
