// @ts-nocheck
import React, { useCallback } from 'react';
import { View, Text, RefreshControl, ScrollView, Pressable, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useAnimatedReaction,
  interpolate,
  Extrapolation,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
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
const NAV_BAR_HEIGHT = 50;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

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

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
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
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{label}</Text>
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
  const { data: feed, isLoading, refetch, isRefetching, isError } = useFeed();
  const { colors, animation, reduceAnimations } = useTheme();
  const { username, avatarColor } = useAppStore();
  const insets = useSafeAreaInsets();

  const scrollY = useSharedValue(0);
  const handleScroll = useCallback((event: any) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  }, [scrollY]);

  const headerHeight = insets.top + NAV_BAR_HEIGHT;
  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  // Spring-physics shared values — these settle naturally when scroll stops
  const blurIntensity = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);
  const borderOpacity = useSharedValue(0);

  // Spring config: snappy settle, physically weighted
  const SPRING = { damping: 18, stiffness: 200, mass: 0.4 };

  useAnimatedReaction(
    () => interpolate(scrollY.value, [0, 80], [0, 90], Extrapolation.CLAMP),
    (target) => { blurIntensity.value = withSpring(target, SPRING); },
  );
  useAnimatedReaction(
    () => interpolate(scrollY.value, [0, 80], [0, 0.35], Extrapolation.CLAMP),
    (target) => { overlayOpacity.value = withSpring(target, SPRING); },
  );
  useAnimatedReaction(
    () => interpolate(scrollY.value, [20, 80], [0, 1], Extrapolation.CLAMP),
    (target) => { borderOpacity.value = withSpring(target, { damping: 22, stiffness: 260, mass: 0.3 }); },
  );

  const blurAnimatedProps = useAnimatedProps(() => ({
    intensity: blurIntensity.value,
  }));
  const headerBgStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  const headerBorderStyle = useAnimatedStyle(() => ({
    opacity: borderOpacity.value,
  }));

  const handlePressThread = useCallback(
    (item: FeedItem) => router.push(`/thread/${item.id}`),
    [router]
  );

  const heroItems = feed?.slice(0, HERO_COUNT) ?? [];
  const popularItems = feed?.slice(HERO_COUNT) ?? [];

  const ListHeader = (
    <View>
      <SectionHeader label="Your Stories" />
      <StoryCircles />
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
      <SectionHeader label="Popular" />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Ambient gradient — gives blur something to render over */}
      <LinearGradient
        colors={colors.ambientGradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.6 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Scrollable content */}
      {isLoading ? (
        <Animated.View entering={animation(FadeIn.duration(80))} style={{ flex: 1, paddingTop: headerHeight }}>
          <SectionHeader label="Your Stories" />
          <StoryCircles />
          <SectionHeader label="Trending" sub="Live" />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </Animated.View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>Something went wrong</Text>
          <Pressable
            onPress={refetch}
            style={{ backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={popularItems}
          renderItem={({ item, index }) => (
            <FeedCard item={item} index={index} onPress={() => handlePressThread(item)} />
          )}
          keyExtractor={item => item.id}
          estimatedItemSize={160}
          contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 110 }}
          onScroll={handleScroll}
          scrollEventThrottle={1}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              progressViewOffset={headerHeight}
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

      {/* Floating glass header — absolutely positioned over content */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: headerHeight,
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        {useBlur ? (
          <AnimatedBlurView
            animatedProps={blurAnimatedProps}
            tint={tint}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {/* Solid fill that fades in — Android fallback + extra readability on iOS */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.bg },
            useBlur ? headerBgStyle : { opacity: 0.95 },
          ]}
        />

        {/* Nav bar content */}
        <View
          style={{
            paddingTop: insets.top,
            height: headerHeight,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingBottom: 6,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <DiamondLogo />
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.5 }}>
              Echo
            </Text>
          </View>

          <Pressable
            onPress={() => router.push('/notifications')}
            style={{ padding: 6, marginRight: 4 }}
          >
            <Bell color={colors.textSecondary} size={22} />
          </Pressable>

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
                borderColor: colors.glassBorder,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                {(username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Bottom edge — fades in as content scrolls under */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: StyleSheet.hairlineWidth,
              backgroundColor: colors.glassBorder,
            },
            headerBorderStyle,
          ]}
        />
      </View>
    </View>
  );
}
