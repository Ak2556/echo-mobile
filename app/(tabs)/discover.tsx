import React, { useCallback } from 'react';
import { View, Text, RefreshControl, ScrollView, Pressable, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
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
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Bell } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FeedCard } from '../../components/social/FeedCard';
import { StoryCircles } from '../../components/social/StoryCircles';
import { HeroCard, HERO_CARD_WIDTH } from '../../components/social/HeroCard';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { useInfiniteFeed } from '../../hooks/queries/useFeed';
import { FeedItem } from '../../types';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';
import { usePerformanceProfile } from '../../lib/performance';
import { groupDiscovery } from '../../lib/echoUX';
import { useRealtimeNewEchoes } from '../../lib/realtime';
import { ErrorState, classifyError } from '../../components/common/ErrorState';
import { UserRow } from '../../components/social/UserRow';
import { useSuggestedUsers } from '../../hooks/queries/useSuggestedUsers';
import { useToggleRemoteFollow } from '../../hooks/queries/useSupabaseSocial';
import { isSupabaseRemote } from '../../lib/remoteConfig';

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
  const {
    data: feedData,
    isLoading,
    refetch,
    isRefetching,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteFeed();
  const feed = feedData?.pages.flat() ?? [];
  const realtime = useRealtimeNewEchoes();
  const { colors, animation } = useTheme();
  const performance = usePerformanceProfile('hot');
  const { username, avatarColor, interests, followingIds } = useAppStore();
  const insets = useSafeAreaInsets();
  const remote = isSupabaseRemote();
  const { data: suggestedUsers = [] } = useSuggestedUsers();
  const followMut = useToggleRemoteFollow();

  const scrollY = useSharedValue(0);
  const heroScrollX = useSharedValue(0);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  }, [scrollY]);

  const headerHeight = insets.top + NAV_BAR_HEIGHT;
  const useBlur = performance.useBlur;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  // Spring-physics shared values — these settle naturally when scroll stops
  const blurIntensity = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);
  const borderOpacity = useSharedValue(0);

  useAnimatedReaction(
    () => interpolate(scrollY.value, [0, 80], [0, performance.maxBlurIntensity], Extrapolation.CLAMP),
    (target) => { blurIntensity.value = target; },
  );
  useAnimatedReaction(
    () => interpolate(scrollY.value, [0, 80], [0, 0.35], Extrapolation.CLAMP),
    (target) => { overlayOpacity.value = target; },
  );
  useAnimatedReaction(
    () => interpolate(scrollY.value, [20, 80], [0, 1], Extrapolation.CLAMP),
    (target) => { borderOpacity.value = target; },
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

  const grouped = groupDiscovery(feed ?? [], interests, followingIds);
  const heroItems = (grouped.forYou.length > 0 ? grouped.forYou : feed?.slice(0, HERO_COUNT)) ?? [];
  const popularItems = (grouped.rising.length > 0 ? grouped.rising : feed?.slice(HERO_COUNT)) ?? [];
  const starterItems = grouped.conversationStarters.slice(0, 3);

  const feedScope = useAppStore.getState().feedScope;
  const setFeedScope = useAppStore.getState().setFeedScope;

  const ListHeader = (
    <View>
      {/* For You / Following toggle */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 8 }}>
        {(['forYou', 'following'] as const).map(scope => {
          const active = feedScope === scope;
          return (
            <Pressable
              key={scope}
              onPress={() => setFeedScope(scope)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 99,
                backgroundColor: active ? colors.accent : 'rgba(255,255,255,0.06)',
              }}
            >
              <Text style={{ color: active ? '#fff' : '#aaa', fontSize: 13, fontWeight: '600' }}>
                {scope === 'forYou' ? 'For You' : 'Following'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!remote && (
        <>
          <SectionHeader label="Your Stories" />
          <StoryCircles />
        </>
      )}
      <SectionHeader label="For You" sub={interests.length > 0 ? `Picked for ${interests[0]}` : 'Start here'} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={HERO_CARD_WIDTH + 12}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        onScroll={(e) => { heroScrollX.value = e.nativeEvent.contentOffset.x; }}
        scrollEventThrottle={16}
      >
        {heroItems.map((item, index) => (
          <HeroCard key={item.id} item={item} onPress={() => handlePressThread(item)} scrollX={heroScrollX} cardIndex={index} />
        ))}
      </ScrollView>
      {starterItems.length > 0 ? (
        <>
          <SectionHeader label="Conversation Starters" sub="Reply-worthy" />
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {starterItems.map(item => (
              <Pressable
                key={item.id}
                onPress={() => handlePressThread(item)}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: colors.surface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                  {item.editorialTitle || item.prompt}
                </Text>
                <Text style={{ color: colors.textSecondary, marginTop: 6, lineHeight: 20 }} numberOfLines={2}>
                  {item.authorNote || item.response}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      <SectionHeader label="Rising Now" sub="High conversation energy" />
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
          {!remote && (
            <>
              <SectionHeader label="Your Stories" />
              <StoryCircles />
            </>
          )}
          <SectionHeader label="Trending" sub="Live" />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </Animated.View>
      ) : isError ? (
        <View style={{ flex: 1, paddingTop: headerHeight, alignItems: 'center', justifyContent: 'center' }}>
          <ErrorState kind={classifyError(error)} onRetry={() => refetch()} />
        </View>
      ) : (
        <>
        {realtime.count > 0 && (
          <Pressable
            onPress={() => { realtime.reset(); refetch(); }}
            style={{
              position: 'absolute', top: headerHeight + 6, alignSelf: 'center', zIndex: 30,
              backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              {realtime.count} new echo{realtime.count > 1 ? 'es' : ''} · tap to refresh
            </Text>
          </Pressable>
        )}
        <FlashList
          data={popularItems}
          renderItem={({ item, index }) => (
            <FeedCard item={item} index={index} onPress={() => handlePressThread(item)} />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 110 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
          onEndReachedThreshold={0.4}
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
            feedScope === 'following' ? (
              <View style={{ paddingTop: 24, paddingHorizontal: 16 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 4 }}>
                  Your following feed is quiet
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 20 }}>
                  Follow some people to fill this up.
                </Text>
                {remote && suggestedUsers.length > 0 ? (
                  <>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Suggested people
                    </Text>
                    {suggestedUsers.map(user => (
                      <UserRow
                        key={user.id}
                        user={user}
                        onPress={() => router.push(`/user/${user.id}`)}
                        showFollowButton
                        onFollowPress={() => followMut.mutate({ userId: user.id, follow: true })}
                      />
                    ))}
                  </>
                ) : (
                  <Pressable
                    onPress={() => router.push('/(tabs)/search')}
                    style={{ backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, alignSelf: 'flex-start' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Find people to follow</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingTop: 32, paddingHorizontal: 24 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Nothing to show yet</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 320 }}>
                  Be the first to publish an echo. Open Chat, ask Echo something real, then share the answer.
                </Text>
                <Pressable
                  onPress={() => router.push('/(tabs)/chat')}
                  style={{ marginTop: 14, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Open chat</Text>
                </Pressable>
              </View>
            )
          }
        />
        </>
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
