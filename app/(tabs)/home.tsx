import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, RefreshControl, ScrollView, Pressable, StyleSheet, NativeSyntheticEvent, NativeScrollEvent, Modal } from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpRight, Bell, Sparkle, TrendUp, PencilSimpleLine, X, GitBranch, ChatCircleText, Info, Clock, SquaresFour, Target } from 'phosphor-react-native';
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
import { TargetToolsPanel } from '../../components/productivity/TargetToolsPanel';
import { getTargetCategory } from '../../lib/targetCategories';
import { IconBadge } from '../../components/ui/IconBadge';


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
  targetLabel,
  targetOutcome,
}: {
  username: string;
  targetLabel: string;
  targetOutcome: string;
}) {
  const router = useRouter();
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();
  const sub = (targetOutcome || targetLabel || '').trim();
  return (
    <View style={{ marginHorizontal: layout.gutter, marginTop: layout.isDesktop ? 12 : 8, marginBottom: 12 }}>
      <Text style={[font.display, { color: colors.text, fontSize: layout.isPhone ? 23 : 28, lineHeight: layout.isPhone ? 28 : 34 }]} numberOfLines={1}>
        {username ? `Welcome back, ${username}` : 'Build your Echo today'}
      </Text>
      {sub ? (
        <Text style={[font.body, { color: colors.textMuted, fontSize: 13.5, lineHeight: 18, marginTop: 2 }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      {/* Only the destinations that aren't already in the bottom tab bar —
          Chat and Market live there, so shortcuts to them would be clutter. */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <QuickLink icon={<SquaresFour color="#fff" size={15} weight="bold" />} color={colors.accent} label="Tools" onPress={() => router.push('/(tabs)/apps')} />
        <QuickLink icon={<Target color="#fff" size={15} weight="bold" />} color={colors.accent} label="Progress" onPress={() => router.push('/target-progress')} />
      </View>
    </View>
  );
}

function QuickLink({ icon, color, label, onPress }: { icon: React.ReactNode; color: string; label: string; onPress: () => void }) {
  const { colors, font } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{
        minHeight: 34,
        borderRadius: 999,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 6,
        paddingRight: 13,
      }}>
        <IconBadge color={color} size={26} radius={10}>{icon}</IconBadge>
        <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 13 }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function FeedScopeRail({
  feedScope,
  setFeedScope,
  onInfo,
}: {
  feedScope: 'semantic' | 'forYou' | 'following' | 'latest';
  setFeedScope: (scope: 'semantic' | 'forYou' | 'following' | 'latest') => void;
  onInfo: () => void;
}) {
  const { colors, font, fontSizes } = useTheme();
  const layout = useResponsiveLayout();
  return (
    <View style={{ marginHorizontal: layout.gutter, marginTop: 2, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {(['semantic', 'forYou', 'following', 'latest'] as const).map(scope => {
          const active = feedScope === scope;
          const label = scope === 'semantic' ? 'For You' : scope === 'forYou' ? 'Trending' : scope === 'following' ? 'Following' : 'Latest';
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
      <Pressable
        onPress={onInfo}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="About this feed"
        style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <Info color={colors.textMuted} size={18} />
      </Pressable>
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
  const performance = usePerformanceProfile('hot');
  const { username, avatarColor, avatarUrl, interests, followingIds } = useAppStore();
  const targetCategoryId = useAppStore(s => s.targetCategory);
  const targetOutcome = useAppStore(s => s.targetOutcome);
  const publishedCount = useAppStore(s => s.publishedEchoes.length);
  const dismissedCoach = useAppStore(s => s.dismissedFirstEchoCoach);
  const setDismissedCoach = useAppStore(s => s.setDismissedFirstEchoCoach);
  const hasCompletedProductOnboarding = useAppStore(s => s.hasCompletedProductOnboarding);
  const onboardingDraftCreated = useAppStore(s => s.onboardingDraftCreated);
  const messagesBySession = useAppStore(s => s.messagesBySession);
  const hasStartedFirstChat = useMemo(
    () => Object.values(messagesBySession).some(messages => messages.some(message => message.role === 'user')),
    [messagesBySession],
  );
  const showProductChecklist = !hasCompletedProductOnboarding && !onboardingDraftCreated;
  const showFirstEchoCoach = publishedCount === 0 && !dismissedCoach && !showProductChecklist;
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const remote = isSupabaseRemote();
  const { data: suggestedUsers = [] } = useSuggestedUsers();
  const followMut = useToggleRemoteFollow();
  const { data: evolvingNow = [] } = useTrendingEvolutions(8);
  const targetCategory = useMemo(() => getTargetCategory(targetCategoryId), [targetCategoryId]);

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
  const [aboutFeedVisible, setAboutFeedVisible] = useState(false);

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

  const ListHeader = (
    <View style={layout.contentStyle}>
      <HomeHero
        username={username}
        targetLabel={targetCategory.label}
        targetOutcome={targetOutcome}
      />
      <FeedScopeRail feedScope={feedScope} setFeedScope={setFeedScope} onInfo={() => setAboutFeedVisible(true)} />

      <Modal
        visible={aboutFeedVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAboutFeedVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          onPress={() => setAboutFeedVisible(false)}
        >
          <Pressable
            style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 }}
            onPress={() => {}}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={[font.displayBlack, { color: colors.text, fontSize: 20, marginBottom: 20 }]}>How this feed works</Text>
            {([
              { scope: 'semantic', label: 'For You', icon: <Sparkle size={16} color={colors.accent} weight="fill" />, desc: 'Personalised to you. We use your reading history to surface echoes you\'re likely to find interesting, using semantic similarity matching.' },
              { scope: 'forYou', label: 'Trending', icon: <TrendUp size={16} color={colors.accent} weight="bold" />, desc: 'Ranked by engagement (likes, comments, reposts) combined with recency. No personalisation — the same ranking for every user.' },
              { scope: 'following', label: 'Following', icon: <Bell size={16} color={colors.accent} weight="bold" />, desc: 'Only echoes from people you follow, ranked by recency and engagement.' },
              { scope: 'latest', label: 'Latest', icon: <Clock size={16} color={colors.accent} weight="bold" />, desc: 'Pure chronological order. No ranking, no personalisation — every public echo in the order it was posted.' },
            ] as const).map(({ scope, label, icon, desc }) => (
              <View key={scope} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {icon}
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: fontSizes.small }]}>{label}</Text>
                </View>
                <Text style={[font.body, { color: colors.textSecondary, fontSize: fontSizes.small, lineHeight: 20 }]}>{desc}</Text>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
      <TargetToolsPanel dense />
      {features.stories && !remote && (
        <>
          <SectionHeader label="Your Stories" />
          <StoryCircles />
        </>
      )}
      {showProductChecklist && (() => {
        // One compact row pointing at the next incomplete step — the feed,
        // not onboarding chrome, owns the first screen.
        const steps = [
          { label: 'Start your first chat', done: hasStartedFirstChat, onPress: () => router.push('/(tabs)/chat') },
          { label: 'Create your first draft', done: onboardingDraftCreated, onPress: () => router.push('/onboarding') },
          { label: 'Publish your first Echo', done: publishedCount > 0, onPress: () => router.push('/create-post') },
        ];
        const doneCount = steps.filter(s => s.done).length;
        const next = steps.find(s => !s.done) ?? steps[steps.length - 1];
        return (
          <Pressable
            onPress={next.onPress}
            style={{
              marginHorizontal: layout.gutter,
              marginTop: 10,
              marginBottom: 6,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={[font.bodySemibold, { color: colors.text, fontSize: fontSizes.small, flex: 1 }]}>
              {next.label}
            </Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: fontSizes.caption }]}>
              {doneCount}/{steps.length}
            </Text>
          </Pressable>
        );
      })()}
      {showFirstEchoCoach && (
        <View
          style={{
            marginHorizontal: layout.gutter,
            marginTop: 8,
            marginBottom: 14,
            padding: layout.isDesktop ? 14 : 13,
            borderRadius: layout.isDesktop ? 14 : 12,
            backgroundColor: colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <PencilSimpleLine color={colors.accent} size={20} weight="bold" />
          <Pressable
            onPress={() => router.push('/create-post')}
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel="Drop your first Echo"
          >
            <Text style={[font.bodyBold, { color: colors.text, fontSize: fontSizes.small, lineHeight: lineHeights.small }]}>
              Write your first Echo
            </Text>
            <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: lineHeights.caption, marginTop: 1 }]}>
              A question or a take is enough.
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setDismissedCoach(true)}
            hitSlop={8}
            accessibilityLabel="Dismiss"
          >
            <X color={colors.textMuted} size={16} />
          </Pressable>
        </View>
      )}
      {features.dailyQuestion && !showFirstEchoCoach && (
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
                  Today&apos;s question
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2, fontFamily: 'Inter_500Medium' }}>
                  Tap to answer
                </Text>
              </View>
              <ArrowUpRight color="#fff" size={20} weight="bold" />
            </LinearGradient>
          </View>
        </Pressable>
      )}
      {evolvingNow.length > 0 && (
        <>
          <SectionHeader label="Evolving now" sub="Perspectives" icon={<GitBranch color={colors.accent} size={16} weight="bold" />} />
          <EvolvingNowRail items={evolvingNow} />
        </>
      )}
      <SectionHeader label="Top conversations" sub="Live now" icon={<TrendUp color={colors.accent} size={16} weight="bold" />} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>

      {isLoading ? (
        <Animated.View entering={animation(FadeIn.duration(80))} style={{ flex: 1, paddingTop: headerHeight }}>
          <View style={layout.contentStyle}>
            {features.stories && !remote && (
              <>
                <SectionHeader label="Your Stories" />
                <StoryCircles />
              </>
            )}
            <SectionHeader label="Trending" sub="Live" />
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
                {realtime.count} new echo{realtime.count > 1 ? 'es' : ''} · tap to refresh
              </Text>
            </Pressable>
          )}
          <FlashList
            data={popularItems}
            renderItem={({ item, index }) => (
              <View style={layout.contentStyle}>
                <FeedCard item={item} index={index} onPress={() => handlePressThread(item)} />
              </View>
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
                    Your following feed is quiet
                  </Text>
                  <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: fontSizes.small, lineHeight: lineHeights.small, marginBottom: 20 }]}>
                    Follow some people to fill this up.
                  </Text>
                  {remote && suggestedUsers.length > 0 ? (
                    <>
                      <Text style={[font.bodyBold, { color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: lineHeights.caption, marginBottom: 8 }]}>
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
                      onPress={() => router.push('/(tabs)/explore')}
                      style={{ backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, alignSelf: 'flex-start' }}
                    >
                      <Text style={[font.bodyBold, { color: '#fff', fontSize: fontSizes.small, lineHeight: lineHeights.small }]}>Find people to follow</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <View style={{ paddingTop: 32 }}>
                  <EmptyState
                    icon={<ChatCircleText color={colors.accent} size={28} />}
                    title="Nothing here yet"
                    subtitle="Start a chat, then publish what you want to keep."
                    actionLabel="Open chat"
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
            maxWidth: layout.contentMaxWidth,
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
