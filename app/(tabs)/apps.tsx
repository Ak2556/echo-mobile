import { getCurrencySymbol } from '../../lib/mini-apps/currency';
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, Pressable, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import Animated, { Extrapolation, FadeIn, interpolate, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { MagnifyingGlass } from 'phosphor-react-native';
import { useTheme } from '../../lib/ui/theme';
import { useTracking } from '../../lib/ui/tracking';
import { noteScroll } from '../../lib/ui/scrollActivity';
import { getTodayProductivity, LocalSearchResult, searchLocalProductivity, TodayProductivity } from '../../lib/core/localSearch';
import { formatMoney } from '../../lib/mini-apps/expenses';
import { MOTION } from '../../lib/ui/motion';
import { useResponsiveLayout } from '../../lib/ui/responsive';
import { TabHeader } from '../../components/ui/TabHeader';
import { SearchBar } from '../../components/feed/SearchBar';
import { MINI_APP_CATALOG, FLAGSHIP_MINI_APPS, isFlagshipMiniApp, type MiniAppCatalogItem } from '../../lib/mini-apps/miniAppCatalog';
import { resolveMiniAppId } from '../../lib/mini-apps/miniAppIntegration';
import { getRecentTools, recordToolOpen } from '../../lib/mini-apps/miniAppRecents';
import { MiniAppIcon } from '../../components/mini-apps/MiniAppIcon';
import { useI18n, ttx } from '../../lib/i18n/i18n';


const GAP = 12;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type MiniApp = MiniAppCatalogItem;
const APPS: MiniApp[] = MINI_APP_CATALOG.filter(a => 
  ['tasks', 'habits', 'notes', 'expenses', 'planner', 'shopping-list', 'pomodoro', 'learn', 'fitness', 'studio', 'editor', 'marketplace'].includes(a.id)
);

/** Eyebrow section label — quiet, letterspaced, the app's editorial voice. */
function Eyebrow({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
  const tracking = useTracking();
  const { colors, font, fontSizes } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <Text style={{ color: colors.textMuted, fontSize: fontSizes.meta, ...font.bodySemibold, letterSpacing: tracking(1.4), textTransform: 'uppercase', flex: 1 }}>
        {children}
      </Text>
      {trailing}
    </View>
  );
}

function AppCard({ app, width, onOpen }: { app: MiniApp; width: number; onOpen: (app: MiniApp) => void }) {
  const { colors, font } = useTheme();
  const { t } = useI18n();
  // Clean app-grid tile: one big icon + its name. Uniform by construction (every
  // tile is icon + a single-line label), so the grid stays perfectly even.
  // Two columns of 100pt icons read as a phone home screen blown up, with each
  // label nearly touching the icon under it (iPhone, 2026-11-27). Three columns
  // at about 64pt, with room between rows.
  const iconSize = Math.min(72, Math.max(50, Math.round(width * 0.5)));
  return (
    // No entering animation. A tile that remounted while it played could freeze
    // part-way: on an iPhone one tile stayed invisible and Shopping sat over
    // Planner (owner screenshot, 2026-11-27).
    <View style={{ width, alignItems: 'center' }}>
      <Pressable
        onPress={() => onOpen(app)}
        accessibilityRole="button"
        accessibilityLabel={`${t('common.open')} ${ttx(app.name)}`}
        style={{ width: '100%' }}
      >
        {/* Layout on an inner View: a style *function* on a Pressable drops its
            padding in Release, which is why the rows had no space between them. */}
        {/* `hovered` exists on web and the Mac app (react-native-web); phones only press. */}
        {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
          <View style={{ width: '100%', alignItems: 'center', gap: 8, paddingTop: 6, paddingBottom: 14, transform: [{ scale: pressed ? 0.92 : 1 }] }}>
            <MiniAppIcon id={app.id} color={app.color} size={iconSize} active={pressed || !!hovered} />
            <Text
              style={{ alignSelf: 'stretch', color: colors.text, fontSize: 13.5, ...font.bodyMedium, textAlign: 'center', lineHeight: 18 }}
              numberOfLines={1}
            >
              {ttx(app.name)}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** Compact tool chip for the Recent row. */
function RecentChip({ app, onOpen }: { app: MiniApp; onOpen: (app: MiniApp) => void }) {
  const { colors, font, radius } = useTheme();
  return (
    <Pressable
      onPress={() => onOpen(app)}
      accessibilityRole="button"
      accessibilityLabel={ttx('Open {name}').replace('{name}', ttx(app.name))}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
    >
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 9,
        paddingLeft: 7, paddingRight: 14,
        height: 46, borderRadius: radius.full,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
      }}>
        <MiniAppIcon id={app.id} color={app.color} size={32} />
        <Text style={{ color: colors.text, fontSize: 13.5, ...font.bodySemibold }} numberOfLines={1}>
          {ttx(app.name)}
        </Text>
      </View>
    </Pressable>
  );
}

/** Compact live stat chip for the condensed "Today" strip. */
function StatChip({ value, label, sub, onPress }: {
  value: string; label: string; sub: string; onPress: () => void;
}) {
  const { colors, font, fontSizes } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <View style={{ width: 138, minHeight: 96, borderRadius: 20, padding: 14, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
        <Text style={{ color: colors.text, fontSize: 24, ...font.displayBlack, letterSpacing: -0.5 }} numberOfLines={1}>{value}</Text>
        <Text style={{ color: colors.text, ...font.bodySemibold, fontSize: fontSizes.small, marginTop: 5 }} numberOfLines={1}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.meta, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
      </View>
    </Pressable>
  );
}

export default function AppsScreen() {
  const { colors, reduceAnimations, font, fontSizes } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const layout = useResponsiveLayout();
  const { width: windowWidth } = useWindowDimensions();
  const [dashboard, setDashboard] = useState<TodayProductivity | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocalSearchResult[]>([]);

  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  // The header draws the title only: 10 top padding, a 34pt Fraunces title that
  // lays out near 44, and 8 of bottom padding. The container clips
  // (overflow:'hidden'), so this must cover the title. Desktop's title is 40pt.
  const HEADER_HEIGHT = insets.top + (layout.isPhone ? 64 : 74);
  const PAD = layout.gutter;
  const contentMaxWidth = Math.min(windowWidth, layout.isDesktop ? 980 : layout.wideMaxWidth);
  const columns = layout.isDesktop ? 6 : layout.isTablet ? 4 : 3;
  const cardWidth = Math.floor((contentMaxWidth - PAD * 2 - GAP * (columns - 1)) / columns);

  const scrollY = useSharedValue(0);
  const blurIntensity = useSharedValue(0);
  const overlayOpacity = useSharedValue(useBlur ? 0.28 : 0.97);
  const borderOpacity = useSharedValue(0);
  const headerBgStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const headerBorderStyle = useAnimatedStyle(() => ({ opacity: borderOpacity.value }));
  const blurAnimatedProps = useAnimatedProps(() => ({ intensity: blurIntensity.value }));

  useAnimatedReaction(
    () => interpolate(scrollY.value, [0, 80], [0, 72], Extrapolation.CLAMP),
    target => { blurIntensity.value = reduceAnimations ? target : withSpring(target, MOTION.settle); },
  );
  useAnimatedReaction(
    () => interpolate(scrollY.value, [0, 80], [useBlur ? 0.28 : 0.97, 0.96], Extrapolation.CLAMP),
    target => { overlayOpacity.value = reduceAnimations ? target : withSpring(target, MOTION.settle); },
  );
  useAnimatedReaction(
    () => interpolate(scrollY.value, [12, 80], [0, 1], Extrapolation.CLAMP),
    target => { borderOpacity.value = reduceAnimations ? target : withSpring(target, MOTION.settle); },
  );
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
    noteScroll();
  }, [scrollY]);

  const appById = useMemo(() => new Map<string, MiniApp>(APPS.map(app => [app.id, app])), []);

  const openTool = useCallback((app: MiniApp) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void recordToolOpen(app.id);
    router.push(app.route);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      getTodayProductivity().then(setDashboard).catch(() => setDashboard(null));
      getRecentTools().then(setRecents).catch(() => setRecents([]));
    }, []),
  );

  const runSearch = (text: string) => {
    setQuery(text);
    if (!text.trim()) { setResults([]); return; }
    searchLocalProductivity(text, 6).then(setResults).catch(() => setResults([]));
  };

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const toolMatches = useMemo(() => searching
    ? APPS.filter(a => {
        const alias = resolveMiniAppId(q);
        return a.name.toLowerCase().includes(q)
          || a.description.toLowerCase().includes(q)
          || a.promise.toLowerCase().includes(q)
          || a.suite.toLowerCase().includes(q)
          || a.highlights.some(h => h.toLowerCase().includes(q))
          || a.replaces.some(r => r.toLowerCase().includes(q))
          || alias === a.id;
      })
    : [], [q, searching]);

  // Flagship (core daily-loop) tools first in their canonical order, then the
  // rest in catalog order. Not recency: recents load after the grid draws, so
  // tiles moved under the user's finger. The Recent row above shows recency.
  const gridApps = useMemo(() => {
    const flagship = FLAGSHIP_MINI_APPS
      .map(id => appById.get(id))
      .filter((a): a is MiniApp => Boolean(a));
    return [...flagship, ...APPS.filter(a => !isFlagshipMiniApp(a.id))];
  }, [appById]);

  const recentApps = useMemo(
    () => recents.map(id => appById.get(id)).filter((a): a is MiniApp => Boolean(a)).slice(0, 4),
    [recents, appById],
  );
  // The Today cards only when one of them has something in it: four zeros say nothing.
  const hasToday = !!dashboard && (
    dashboard.tasks.open > 0 || dashboard.planner.total > 0 || dashboard.shopping.remaining > 0
    || dashboard.expenses.expense > 0 || dashboard.expenses.balance !== 0
  );

  // One wrapping container, tiles keyed by tool. With a View per row, a tool
  // that changed rows was unmounted and mounted again.
  const renderGrid = (list: MiniApp[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP }}>
      {list.map(app => <AppCard key={app.id} app={app} width={cardWidth} onOpen={openTool} />)}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingTop: HEADER_HEIGHT, paddingHorizontal: PAD, paddingBottom: Math.max(PAD, layout.bottomChromePadding), gap: 18 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Unified search: tools and your content in one box, the same field Explore uses. */}
        <SearchBar value={query} onChangeText={runSearch} placeholder={ttx("Search tools, notes, habits…")} />

        {searching ? (
          /* ── Search results ── */
          <Animated.View entering={FadeIn.duration(160)} style={{ gap: 18 }}>
            {toolMatches.length > 0 && (
              <View style={{ gap: GAP }}>
                <Eyebrow>{ttx("Tools")}</Eyebrow>
                {renderGrid(toolMatches)}
              </View>
            )}
            {results.length > 0 && (
              <View>
                <Eyebrow>{ttx("In your content")}</Eyebrow>
                {results.map((r, i) => (
                  <Pressable key={`${r.app}-${r.id}`} onPress={() => router.push(r.route as Href)}>
                    <View style={{ paddingVertical: 11, borderBottomWidth: i < results.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                      <Text style={{ color: colors.text, ...font.bodySemibold, fontSize: fontSizes.label }} numberOfLines={1}>{r.title}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: fontSizes.meta, marginTop: 2 }} numberOfLines={1}>{r.app} · {r.subtitle}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            {toolMatches.length === 0 && results.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
                <MagnifyingGlass color={colors.glassBorder} size={34} weight="duotone" />
                <Text style={{ color: colors.text, fontSize: 15, ...font.bodySemibold }}>{ttx("No matches")}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, textAlign: 'center' }}>{ttx("Try a tool name, or a note, habit, or expense term.")}</Text>
              </View>
            )}
          </Animated.View>
        ) : (
          /* ── Browse ── */
          // 2026-11-28 simplify: one Recent row, then every tool. The Smart start
          // card, a second recents row and the grid showed the same tools three times
          // before the list began; the lane chips (Master, Plan, …) filtered 12
          // tools that fit on one screen; the target picker moved to Progress.
          <>
            {recentApps.length > 0 && (
              <View>
                <Eyebrow>{ttx("Recent")}</Eyebrow>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -PAD, paddingHorizontal: PAD }}>
                  {recentApps.map(app => <RecentChip key={app.id} app={app} onOpen={openTool} />)}
                </ScrollView>
              </View>
            )}

            <View style={{ gap: GAP }}>
              <Eyebrow>{ttx('All tools')}</Eyebrow>
              {renderGrid(gridApps)}
            </View>

            {hasToday && dashboard && (
              <View>
                <Eyebrow>{ttx("Today")}</Eyebrow>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: GAP }} style={{ marginHorizontal: -PAD, paddingHorizontal: PAD }}>
                  <StatChip value={`${dashboard.tasks.open}`} label={ttx("Open tasks")} sub={`${dashboard.tasks.dueToday} due today`} onPress={() => router.push('/mini-apps/tasks' as Href)} />
                  <StatChip value={`${dashboard.planner.open}`} label={ttx("Plan open")} sub={`${dashboard.planner.done}/${dashboard.planner.total} done`} onPress={() => router.push('/mini-apps/planner' as Href)} />
                  <StatChip value={`${dashboard.shopping.remaining}`} label={ttx("Shopping")} sub={`${dashboard.shopping.checked} checked`} onPress={() => router.push('/mini-apps/shopping-list' as Href)} />
                  <StatChip value={`${getCurrencySymbol(dashboard.expenses.currency)}${formatMoney(Math.abs(dashboard.expenses.balance))}`} label={ttx("Weekly balance")} sub={`${getCurrencySymbol(dashboard.expenses.currency)}${formatMoney(dashboard.expenses.expense)} spent`} onPress={() => router.push('/mini-apps/expenses' as Href)} />
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Sticky glass header */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_HEIGHT, overflow: 'hidden', zIndex: 10 }}>
        {useBlur && <AnimatedBlurView animatedProps={blurAnimatedProps} tint={tint} style={StyleSheet.absoluteFill} />}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, headerBgStyle]} />
        <View style={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingTop: insets.top + 10, paddingHorizontal: PAD, paddingBottom: 8 }}>
          <TabHeader title={ttx("Tools")} />
        </View>
        <Animated.View style={[{ position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'transparent' }, headerBorderStyle]} />
      </View>
    </View>
  );
}
