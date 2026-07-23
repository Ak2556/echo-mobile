import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, RefreshControl, ScrollView, Pressable, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useAnimatedReaction,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpRight, Bell, Sparkle, TrendUp, PencilSimpleLine, GitBranch, ChatCircleText, X } from 'phosphor-react-native';
import { FeedCard } from '../../components/social/FeedCard';
import { StoryCircles } from '../../components/social/StoryCircles';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { Avatar } from '../../components/ui/Avatar';
import { useInfiniteFeed, useTrendingEvolutions } from '../../hooks/queries/useFeed';
import { EvolutionGroup, FeedItem } from '../../types';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';
import { usePerformanceProfile } from '../../lib/performance';
import { groupDiscovery } from '../../lib/echoUX';
import { useRealtimeNewEchoes } from '../../lib/realtime';
import { ErrorState, classifyError } from '../../components/common/ErrorState';
import { ComposeFAB } from '../../components/ui/ComposeFAB';
import { UserRow } from '../../components/social/UserRow';
import { EmptyState } from '../../components/common/EmptyState';
import { useSuggestedUsers } from '../../hooks/queries/useSuggestedUsers';
import { useToggleRemoteFollow } from '../../hooks/queries/useSupabaseSocial';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { feedbackHaptic } from '../../lib/accentDesign';
import { pingDailyActivity } from '../../lib/retention';
import { recordAppOpen } from '../../lib/personalNudges';
import { features } from '../../lib/featureFlags';
import { getTopPerspectiveSummary } from '../../lib/perspectives';
import { track } from '../../lib/analytics';
import { useResponsiveLayout } from '../../lib/responsive';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { useTutorialStore } from '../../store/tutorialStore';
import { useI18n, type TranslationKey } from '../../lib/i18n';
import { DAILY_THOUGHTS, pickThought, thoughtById, todayKey } from '../../lib/dailyThoughts';


const NAV_BAR_HEIGHT = 50;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
const SENSITIVE_TAGS = new Set(['nsfw', 'adult', 'explicit', 'mature', '18+', '18plus', 'gore', 'graphic', 'disturbing']);

function SectionHeader({ label, sub }: { label: string; sub?: string; icon?: React.ReactNode }) {
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        paddingHorizontal: layout.gutter,
        marginTop: layout.isDesktop ? 28 : 32,
        marginBottom: 14,
        gap: 8,
      }}
    >
      <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' }]}>{label}</Text>
      {sub && (
        <Text style={[font.body, { color: colors.textMuted, fontSize: 12 }]}>
          · {sub}
        </Text>
      )}
    </View>
  );
}

function HomeHero({
  username,
  t,
}: {
  username: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();
  return (
    <View style={{ marginHorizontal: layout.gutter, marginTop: layout.isDesktop ? 12 : 8, marginBottom: 12 }}>
      <Text style={[font.display, { color: colors.text, fontSize: layout.isPhone ? 23 : 28, lineHeight: layout.isPhone ? 28 : 34 }]} numberOfLines={1}>
        {username ? t('home.welcomeBack', { name: username }) : t('home.buildToday')}
      </Text>
    </View>
  );
}

/**
 * A single reflective thought, personalized to the user's interests, shown once
 * per day. Dismissing it (the ✕) hides it until tomorrow, when a new, never-
 * repeated thought takes its place. The day's pick is pinned in the store so it
 * stays stable across re-renders and restarts.
 */
function DailyThought() {
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();
  const interests = useAppStore(s => s.interests);
  const dailyThought = useAppStore(s => s.dailyThought);
  const setDailyThought = useAppStore(s => s.setDailyThought);
  const seenThoughtIds = useAppStore(s => s.seenThoughtIds);
  const setSeenThoughtIds = useAppStore(s => s.setSeenThoughtIds);
  const dismissedOn = useAppStore(s => s.dailyThoughtDismissedOn);
  const dismissDailyThought = useAppStore(s => s.dismissDailyThought);
  const key = todayKey();
  const assignedRef = useRef<string | null>(null);

  // Today's pinned pick if we already chose one; otherwise a fresh pick so the
  // card renders immediately (the effect below persists the choice).
  const active = useMemo(() => {
    if (dailyThought?.dayKey === key) {
      const pinned = thoughtById(dailyThought.id);
      if (pinned) return pinned;
    }
    return pickThought({ interests, seenIds: seenThoughtIds });
  }, [dailyThought, key, interests, seenThoughtIds]);

  // On a new day, pin the pick and mark it seen (starting a fresh cycle once the
  // whole pool has been shown). Runs at most once per day.
  useEffect(() => {
    if (dailyThought?.dayKey === key || assignedRef.current === key) return;
    assignedRef.current = key;
    const nextSeen = seenThoughtIds.includes(active.id) ? seenThoughtIds : [...seenThoughtIds, active.id];
    setSeenThoughtIds(nextSeen.length >= DAILY_THOUGHTS.length ? [active.id] : nextSeen);
    setDailyThought({ dayKey: key, id: active.id });
  }, [key, dailyThought, active, seenThoughtIds, setSeenThoughtIds, setDailyThought]);

  if (dismissedOn === key) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      exiting={FadeOut.duration(180)}
      style={{ marginHorizontal: layout.gutter, marginTop: layout.isDesktop ? 4 : 2, marginBottom: 12 }}
    >
      <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
        <LinearGradient
          colors={[`${colors.accent}22`, `${colors.accent}0A`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={{ padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Sparkle color={colors.accent} size={14} weight="fill" />
              <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' }]}>
                Thought for today
              </Text>
            </View>
            <Pressable
              onPress={() => dismissDailyThought(key)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Dismiss today's thought"
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <X color={colors.textMuted} size={16} weight="bold" />
            </Pressable>
          </View>
          <Text style={[font.display, { color: colors.text, fontSize: layout.isPhone ? 17.5 : 20, lineHeight: layout.isPhone ? 24 : 27 }]}>
            {active.text}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * The single next-step card shown on a new user's focused home — replaces the
 * old checklist + first-echo coach + daily card trio. Picks ONE action by
 * priority (chat → first Echo → daily question) so there's exactly one obvious
 * thing to do.
 */
function HomeNextStep({ hasStartedFirstChat, publishedCount, t }: {
  hasStartedFirstChat: boolean;
  publishedCount: number;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const router = useRouter();
  const { font, fontSizes, lineHeights } = useTheme();
  const layout = useResponsiveLayout();
  const target = useTutorialTarget('home-nextstep');

  const step = !hasStartedFirstChat
    ? {
        icon: <ChatCircleText color="#fff" size={22} weight="fill" />,
        title: t('home.nextStartChat'),
        body: t('home.nextStartChatBody'),
        route: '/(tabs)/chat' as const,
      }
    : publishedCount === 0
      ? {
          icon: <PencilSimpleLine color="#fff" size={22} weight="fill" />,
          title: t('home.nextShareEcho'),
          body: t('home.nextShareEchoBody'),
          route: '/create-post' as const,
        }
      : {
          icon: <Sparkle color="#fff" size={22} weight="fill" />,
          title: t('home.nextDaily'),
          body: t('home.nextDailyBody'),
          route: '/daily-question' as const,
        };

  return (
    <View
      ref={target.ref}
      onLayout={target.onLayout}
      style={{ marginHorizontal: layout.gutter, marginTop: 6, marginBottom: 12 }}
    >
      <AnimatedPressable
        onPress={() => router.push(step.route)}
        haptic="medium"
        style={{ borderRadius: 18, overflow: 'hidden' }}
      >
        <LinearGradient
          colors={['#E8834E', '#C94F1D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 16 }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
            {step.icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[font.display, { color: '#fff', fontSize: 17, lineHeight: 22 }]}>{step.title}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: fontSizes.caption, lineHeight: lineHeights.caption, marginTop: 2 }}>
              {step.body}
            </Text>
          </View>
          <ArrowUpRight color="#fff" size={20} weight="bold" />
        </LinearGradient>
      </AnimatedPressable>
    </View>
  );
}

function FeedScopeRail({
  feedScope,
  setFeedScope,
  t,
}: {
  feedScope: 'semantic' | 'forYou' | 'following' | 'latest';
  setFeedScope: (scope: 'semantic' | 'forYou' | 'following' | 'latest') => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const { colors, font, fontSizes } = useTheme();
  const layout = useResponsiveLayout();
  return (
    <View style={{ marginHorizontal: layout.gutter, marginTop: 2, marginBottom: 14 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {(['semantic', 'forYou', 'following', 'latest'] as const).map(scope => {
          const active = feedScope === scope;
          const label = scope === 'semantic' ? t('home.forYou') : scope === 'forYou' ? t('home.trending') : scope === 'following' ? t('home.following') : t('home.latest');
          return (
            <Pressable
              key={scope}
              onPress={() => { void feedbackHaptic('select'); setFeedScope(scope); }}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              style={{
                minHeight: 36,
                borderRadius: 999,
                backgroundColor: active ? colors.accent : colors.surface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: active ? colors.accent : colors.border,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={[font.bodySemibold, { color: active ? '#fff' : colors.textSecondary, fontSize: fontSizes.small }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
  const feed = useMemo(() => feedData?.pages.flat() ?? [], [feedData]);
  const realtime = useRealtimeNewEchoes();
  const { colors, animation, font, fontSizes, lineHeights } = useTheme();
  const { t } = useI18n();
  const performance = usePerformanceProfile('hot');
  const { username, avatarColor, avatarUrl, interests, followingIds } = useAppStore();
  const publishedCount = useAppStore(s => s.publishedEchoes.length);
  const hasCompletedFirstRun = useAppStore(s => s.hasCompletedFirstRun);
  const messagesBySession = useAppStore(s => s.messagesBySession);
  const hasStartedFirstChat = useMemo(
    () => Object.values(messagesBySession).some(messages => messages.some(message => message.role === 'user')),
    [messagesBySession],
  );
  // Progressive disclosure: a user who just came through the first-run value
  // moment gets a focused home — one clear next action, the feed, nothing else
  // competing above the fold — until they engage (post or chat), then they
  // graduate to the full rich home. Gated on the first-run flag (not just local
  // activity) so returning users on a fresh device are never demoted.
  const isEngaged = publishedCount > 0 || hasStartedFirstChat;
  const focusedHome = hasCompletedFirstRun && !isEngaged;

  // Interactive coach-mark tour — runs once for a fresh first-run user.
  const feedTarget = useTutorialTarget('home-feed');
  const startTour = useTutorialStore(s => s.startTour);
  const hasSeenHomeTutorial = useAppStore(s => s.hasSeenHomeTutorial);
  useEffect(() => {
    if (focusedHome && !hasSeenHomeTutorial) {
      const t = setTimeout(() => startTour('home'), 650);
      return () => clearTimeout(t);
    }
  }, [focusedHome, hasSeenHomeTutorial, startTour]);
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const remote = isSupabaseRemote();
  const { data: suggestedUsers = [] } = useSuggestedUsers();
  const followMut = useToggleRemoteFollow();
  const { data: evolvingNow = [] } = useTrendingEvolutions(8);
  useEffect(() => { pingDailyActivity(); recordAppOpen('feed'); }, []);

  const scrollY = useSharedValue(0);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  }, [scrollY]);

  const headerHeight = insets.top + (layout.isDesktop ? 64 : NAV_BAR_HEIGHT);
  const useBlur = performance.useBlur;
  const tint = colors.isDark ? 'dark' : 'extraLight';

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

  const grouped = useMemo(
    () => groupDiscovery(feed ?? [], interests, followingIds),
    [feed, interests, followingIds],
  );

  const feedScope = useAppStore(s => s.feedScope);
  const setFeedScope = useAppStore(s => s.setFeedScope);
  const sensitiveContentFilter = useAppStore(s => s.sensitiveContentFilter);
  const unreadNotifs = useAppStore(s => s.notifications.filter(n => !n.isRead).length);

  const scopedAll = useMemo(() => {
    if (!feed) return [];
    let result: typeof feed;
    if (feedScope === 'following') {
      const followingSet = new Set(followingIds);
      result = feed.filter(f => followingSet.has(f.userId));
    } else if (feedScope === 'forYou') {
      result = grouped.rising.length > 0 ? grouped.rising : feed;
    } else {
      result = grouped.forYou.length > 0 ? grouped.forYou : feed;
    }
    if (sensitiveContentFilter) {
      result = result.filter(f => !f.hashtags?.some(tag => SENSITIVE_TAGS.has(tag.toLowerCase().replace(/^#/, ''))));
    }
    return result;
  }, [feed, feedScope, followingIds, grouped.forYou, grouped.rising, sensitiveContentFilter]);

  const popularItems = scopedAll;

  // Tablet/desktop: the feed becomes a two-column masonry inside a wider
  // centred container; the header shares that same width so it aligns.
  // iPad shows a single-column feed — one card at a time — instead of a
  // 2-column masonry. The column is capped at a balanced reading width and
  // centered so cards keep a natural height-to-width ratio rather than
  // stretching edge to edge. Masonry stays only for wide desktop web; the
  // header shares the same width so everything aligns.
  const useMasonry = layout.isDesktop;
  const feedMaxWidth = layout.isDesktop ? layout.wideMaxWidth : layout.width;
  const feedContainerStyle = {
    width: '100%' as const,
    maxWidth: feedMaxWidth,
    alignSelf: 'center' as const,
  };

  const ListHeader = (
    <View style={feedContainerStyle}>
      <HomeHero
        username={username}
        t={t}
      />
      {/* A single interest-tuned thought, once a day, dismissible with ✕. */}
      {!focusedHome && <DailyThought />}
      {/* New users get ONE clear next action instead of three competing cards
          (old checklist + first-echo coach + daily card). */}
      {focusedHome && (
        <HomeNextStep hasStartedFirstChat={hasStartedFirstChat} publishedCount={publishedCount} t={t} />
      )}
      {/* The daily-question ritual is the north-star action — it leads on an
          engaged home, right under the greeting, before the feed controls. */}
      {features.dailyQuestion && !focusedHome && (
        <Pressable onPress={() => router.push('/daily-question')} style={{ marginHorizontal: 12, marginTop: 4, marginBottom: 6 }}>
          <View style={{ borderRadius: 20, overflow: 'hidden' }}>
            <LinearGradient
              colors={['#E8834E', '#C94F1D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ paddingHorizontal: 18, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[font.display, { color: '#fff', fontSize: 18, lineHeight: 24 }]}>
                  {t('home.todayQuestion')}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2, fontFamily: 'Inter_500Medium' }}>
                  {t('home.tapToAnswer')}
                </Text>
              </View>
              <ArrowUpRight color="#fff" size={20} weight="bold" />
            </LinearGradient>
          </View>
        </Pressable>
      )}
      {!focusedHome && (
        <FeedScopeRail feedScope={feedScope} setFeedScope={setFeedScope} t={t} />
      )}
      {!focusedHome && features.stories && !remote && (
        <>
          <SectionHeader label={t('home.yourStories')} />
          <StoryCircles />
        </>
      )}
      {!focusedHome && evolvingNow.length > 0 && (
        <>
          <SectionHeader label={t('home.evolvingNow')} sub={t('home.perspectives')} icon={<GitBranch color={colors.accent} size={16} weight="bold" />} />
          <EvolvingNowRail items={evolvingNow} />
        </>
      )}
      <View ref={feedTarget.ref} onLayout={feedTarget.onLayout}>
        <SectionHeader label={focusedHome ? t('home.fromCommunity') : t('home.topConversations')} sub={focusedHome ? undefined : t('home.liveNow')} icon={<TrendUp color={colors.accent} size={16} weight="bold" />} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>

      {isLoading ? (
        <Animated.View entering={animation(FadeIn.duration(80))} style={{ flex: 1, paddingTop: headerHeight }}>
          <View style={feedContainerStyle}>
            {features.stories && !remote && (
              <>
                <SectionHeader label={t('home.yourStories')} />
                <StoryCircles />
              </>
            )}
            <SectionHeader label={t('home.trending')} sub={t('common.live')} />
            <FeedCardSkeleton />
            <FeedCardSkeleton />
          </View>
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
              <Text style={[font.bodyBold, { color: '#fff', fontSize: fontSizes.small, lineHeight: lineHeights.small }]}>
                {t('home.newEchoes', { count: realtime.count, noun: realtime.count > 1 ? 'echoes' : 'echo' })}
              </Text>
            </Pressable>
          )}
          <FlashList
            data={popularItems}
            numColumns={useMasonry ? 2 : 1}
            masonry={useMasonry}
            optimizeItemArrangement={useMasonry}
            style={feedContainerStyle}
            renderItem={({ item, index }) => (
              useMasonry ? (
                <FeedCard item={item} index={index} onPress={() => handlePressThread(item)} />
              ) : (
                <FeedCard item={item} index={index} onPress={() => handlePressThread(item)} />
              )
            )}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: layout.bottomChromePadding }}
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
                <View style={{ paddingTop: 24, paddingHorizontal: layout.gutter }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: fontSizes.title, lineHeight: lineHeights.title, marginBottom: 4 }]}>
                    {t('home.followingQuiet')}
                  </Text>
                  <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: fontSizes.small, lineHeight: lineHeights.small, marginBottom: 20 }]}>
                    {t('home.followingQuietBody')}
                  </Text>
                  {remote && suggestedUsers.length > 0 ? (
                    <>
                      <Text style={[font.bodyBold, { color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: lineHeights.caption, marginBottom: 8 }]}>
                        {t('home.suggestedPeople')}
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
                      onPress={() => router.push('/(tabs)/explore')}
                      style={{ backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, alignSelf: 'flex-start' }}
                    >
                      <Text style={[font.bodyBold, { color: '#fff', fontSize: fontSizes.small, lineHeight: lineHeights.small }]}>{t('home.findPeople')}</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <View style={{ paddingTop: 32 }}>
                  <EmptyState
                    icon={<ChatCircleText color={colors.accent} size={28} />}
                    title={t('home.communityQuietTitle')}
                    subtitle={t('home.communityQuietBody')}
                    actionLabel={t('home.openChat')}
                    onAction={() => router.push('/(tabs)/chat')}
                  />
                </View>
              )
            }
          />
        </>
      )}

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

        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.bg },
            useBlur ? headerBgStyle : { opacity: 0.95 },
          ]}
        />

        <View
          style={{
            width: '100%',
            maxWidth: feedMaxWidth,
            alignSelf: 'center',
            paddingTop: insets.top + (layout.isDesktop ? 10 : 0),
            height: headerHeight,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: layout.gutter,
            paddingBottom: 6,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flex: 1 }}>
            <Text style={[font.displayBlack, { color: colors.text, fontSize: 30 }]}>
              Echo
            </Text>
          </View>

          <Pressable
            onPress={() => router.push('/(tabs)/notifications')}
            style={{ padding: 6, marginRight: 4 }}
            accessibilityRole="button"
            accessibilityLabel={unreadNotifs > 0 ? `Notifications — ${unreadNotifs} unread` : 'Notifications'}
          >
            <View>
              <Bell color={colors.textSecondary} size={22} />
              {unreadNotifs > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -6,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 4,
                    borderRadius: 999,
                    backgroundColor: colors.danger,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: colors.bg,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                    {unreadNotifs > 99 ? '99+' : unreadNotifs}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>

          <Pressable onPress={() => router.push('/(tabs)/you')} accessibilityLabel="Open your profile">
            <View style={{ borderRadius: 17, borderWidth: 2, borderColor: colors.glassBorder }}>
              <Avatar name={username || '?'} color={avatarColor} url={avatarUrl} size={30} />
            </View>
          </Pressable>
        </View>

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

      <ComposeFAB />
    </View>
  );
}

function EvolvingNowRail({ items }: { items: EvolutionGroup[] }) {
  const router = useRouter();
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: 10, paddingBottom: 2 }}
    >
      {items.map(item => {
        const summary = getTopPerspectiveSummary(item.perspectiveCounts);
        return (
          <Pressable
            key={item.rootId}
            onPress={() => {
              track('evolving_rail_opened', { root_id: item.rootId, branch_count: item.branchCount });
              router.push({ pathname: '/evolution/[rootId]', params: { rootId: item.rootId } });
            }}
          >
            <View style={{ width: 252, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface }}>
              <LinearGradient
                colors={[`${colors.accent}38`, `${colors.accent}0F`, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={{ padding: 15 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 9 }}>
                  <GitBranch color={colors.accent} size={14} weight="fill" />
                  <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 12 }]}>
                    {item.branchCount} {item.branchCount === 1 ? 'perspective' : 'perspectives'}
                  </Text>
                </View>
                <Text style={[font.display, { color: colors.text, fontSize: 16, lineHeight: 21 }]} numberOfLines={2}>
                  {item.rootTitle || item.rootPrompt}
                </Text>
                <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: 12, marginTop: 9 }]} numberOfLines={1}>
                  {summary || `${item.uniqueAuthors} people are adding angles`}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
