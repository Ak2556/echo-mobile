// @ts-nocheck
import React, { useCallback } from 'react';
import { View, Text, RefreshControl, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Bell } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FeedCard } from '../../components/social/FeedCard';
import { StoryCircles } from '../../components/social/StoryCircles';
import { HeroCard, HERO_CARD_WIDTH } from '../../components/social/HeroCard';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { useFeed } from '../../hooks/queries/useFeed';
import { FeedItem } from '../../types';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';

const HERO_COUNT = 5;

function DiamondLogo() {
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        transform: [{ rotate: '45deg' }],
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={['#A78BFA', '#3B82F6', '#EC4899']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      />
    </View>
  );
}

function SectionHeader({
  label,
  sub,
}: {
  label: string;
  sub?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        paddingHorizontal: 16,
        marginTop: 22,
        marginBottom: 14,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{label}</Text>
      {sub && (
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>
          {sub}
        </Text>
      )}
    </View>
  );
}

export default function DiscoverScreen() {
  const router = useRouter();
  const { data: feed, isLoading, refetch, isRefetching } = useFeed();
  const { colors, animation } = useTheme();
  const { username, avatarColor } = useAppStore();

  const handlePressThread = useCallback(
    (item: FeedItem) => router.push(`/thread/${item.id}`),
    [router]
  );

  const heroItems = feed?.slice(0, HERO_COUNT) ?? [];
  const popularItems = feed?.slice(HERO_COUNT) ?? [];

  const ListHeader = (
    <View>
      {/* Story circles */}
      <SectionHeader label="Your Stories" />
      <StoryCircles />

      {/* Trending hero cards — horizontal snap scroll */}
      <SectionHeader label="Trending" sub="Live" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={HERO_CARD_WIDTH + 12}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {heroItems.map(item => (
          <HeroCard key={item.id} item={item} onPress={() => handlePressThread(item)} />
        ))}
      </ScrollView>

      {/* Popular section */}
      <SectionHeader label="Popular" />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        {/* Logo + name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <DiamondLogo />
          <Text
            style={{ color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: -0.5 }}
          >
            Echo
          </Text>
        </View>

        {/* Bell */}
        <Pressable
          onPress={() => router.push('/notifications')}
          style={{ padding: 6, marginRight: 4 }}
        >
          <Bell color={colors.textSecondary} size={22} />
        </Pressable>

        {/* Avatar / create */}
        <Pressable onPress={() => router.push('/create-post')}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: avatarColor || colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.18)',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
              {(username || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        </Pressable>
      </View>

      {isLoading ? (
        <Animated.View entering={animation(FadeIn.duration(300))} style={{ flex: 1 }}>
          <SectionHeader label="Your Stories" />
          <StoryCircles />
          <SectionHeader label="Trending" sub="Live" />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </Animated.View>
      ) : (
        <FlashList
          data={popularItems}
          renderItem={({ item, index }) => (
            <FeedCard item={item} index={index} onPress={() => handlePressThread(item)} />
          )}
          keyExtractor={item => item.id}
          estimatedItemSize={160}
          contentContainerStyle={{ paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>No echoes yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
