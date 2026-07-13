import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, Pressable, TextInput, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import Animated, { Extrapolation, FadeIn, FadeInDown, interpolate, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Calculator, ArrowsLeftRight, Receipt, Timer,
  Key, Globe, BracketsCurly, FileText,
  Palette, Pulse,
  Camera, Microphone, NotePencil, CheckCircle, Wallet, DiceSix, VideoCamera, Target, Barbell,
  MagnifyingGlass, ArrowRight, CaretRight, X,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { getTodayProductivity, LocalProductivityApp, LocalSearchResult, searchLocalProductivity, TodayProductivity } from '../../lib/localSearch';
import { formatMoney } from '../../lib/expenses';
import { formatMemoTime } from '../../lib/voiceMemos';
import { MOTION } from '../../lib/motion';
import { useResponsiveLayout } from '../../lib/responsive';
import { TARGET_CATEGORIES, getTargetCategory } from '../../lib/targetCategories';
import { useAppStore } from '../../store/useAppStore';
import { MINI_APP_CATALOG, type MiniAppCatalogItem } from '../../lib/miniAppCatalog';
import { getRecentTools, recordToolOpen } from '../../lib/miniAppRecents';

const PAD = 20;
const GAP = 12;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type ToolLane = 'all' | 'focus' | 'capture' | 'money' | 'health' | 'utility' | 'media';

const TOOL_LANES: { id: ToolLane; label: string; apps?: string[] }[] = [
  { id: 'all', label: 'All' },
  { id: 'focus', label: 'Focus', apps: ['pomodoro', 'habits', 'notes', 'markdown', 'voice-memo'] },
  { id: 'capture', label: 'Capture', apps: ['notes', 'voice-memo', 'camera', 'markdown', 'color-tools'] },
  { id: 'money', label: 'Money', apps: ['expenses', 'calculator', 'bill-splitter', 'converter'] },
  { id: 'health', label: 'Health', apps: ['fitness', 'habits', 'bmi', 'camera'] },
  { id: 'utility', label: 'Utility', apps: ['calculator', 'converter', 'world-clock', 'json-formatter', 'password-gen', 'dice'] },
  { id: 'media', label: 'Media', apps: ['camera', 'video-player', 'voice-memo', 'color-tools'] },
];

type MiniApp = MiniAppCatalogItem;
const APPS: MiniApp[] = MINI_APP_CATALOG;

/** Darken a #RRGGBB color by a 0..1 factor. */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.round(c * (1 - factor)));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** iOS-style icon plate: gradient rounded-square + white fill glyph. */
function IconPlate({ id, color, size = 44 }: { id: string; color: string; size?: number }) {
  return (
    <LinearGradient
      colors={[color, shade(color, 0.35)]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ width: size, height: size, borderRadius: size * 0.29, alignItems: 'center', justifyContent: 'center' }}
    >
      <AppIcon id={id} color="#fff" size={Math.round(size * 0.52)} />
    </LinearGradient>
  );
}

function AppIcon({ id, color, size = 28 }: { id: string; color: string; size?: number }) {
  const p = { color, size, weight: 'fill' as const };
  switch (id) {
    case 'calculator':    return <Calculator      {...p} />;
    case 'converter':     return <ArrowsLeftRight  {...p} />;
    case 'bill-splitter': return <Receipt          {...p} />;
    case 'pomodoro':      return <Timer            {...p} />;
    case 'password-gen':  return <Key              {...p} />;
    case 'world-clock':   return <Globe            {...p} />;
    case 'json-formatter':return <BracketsCurly    {...p} />;
    case 'markdown':      return <FileText         {...p} />;
    case 'color-tools':   return <Palette          {...p} />;
    case 'bmi':           return <Pulse            {...p} />;
    case 'fitness':       return <Barbell          {...p} />;
    case 'camera':        return <Camera           {...p} />;
    case 'voice-memo':    return <Microphone       {...p} />;
    case 'notes':         return <NotePencil       {...p} />;
    case 'habits':        return <CheckCircle      {...p} />;
    case 'expenses':      return <Wallet           {...p} />;
    case 'dice':          return <DiceSix          {...p} />;
    case 'video-player':  return <VideoCamera      {...p} />;
    default:              return <Calculator       {...p} />;
  }
}

/** Eyebrow section label — quiet, letterspaced, the app's editorial voice. */
function Eyebrow({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase', flex: 1 }}>
        {children}
      </Text>
      {trailing}
    </View>
  );
}

function AppCard({ app, index, width, onOpen }: { app: MiniApp; index: number; width: number; onOpen: (app: MiniApp) => void }) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 10) * 22).duration(240).damping(MOTION.cardEntrance.damping).stiffness(MOTION.cardEntrance.stiffness).mass(MOTION.cardEntrance.mass)}
      style={{ width }}
    >
      <Pressable
        onPress={() => onOpen(app)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${app.name}`}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.965 : 1 }] })}
      >
        <View style={{
          minHeight: 120,
          borderRadius: 20,
          overflow: 'hidden',
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
          padding: 15,
          justifyContent: 'space-between',
        }}>
          <LinearGradient
            colors={[`${app.color}22`, `${app.color}0A`, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <IconPlate id={app.id} color={app.color} size={44} />
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 19 }} numberOfLines={1}>
              {app.name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 }} numberOfLines={2}>
              {app.description}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Compact tool chip for the "Jump back in" recents row. */
function RecentChip({ app, onOpen }: { app: MiniApp; onOpen: (app: MiniApp) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onOpen(app)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${app.name}`}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
    >
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 9,
        paddingLeft: 7, paddingRight: 14,
        height: 46, borderRadius: 999,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
      }}>
        <IconPlate id={app.id} color={app.color} size={32} />
        <Text style={{ color: colors.text, fontSize: 13.5, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
          {app.name}
        </Text>
      </View>
    </Pressable>
  );
}

/** Compact live stat chip for the condensed "Today" strip. */
function StatChip({ value, label, sub, color, onPress }: {
  value: string; label: string; sub: string; color: string; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <View style={{ width: 138, minHeight: 92, borderRadius: 18, padding: 14, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
        <LinearGradient colors={[`${color}22`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Text style={{ color: colors.text, fontSize: 24, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5 }} numberOfLines={1}>{value}</Text>
        <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 12.5, marginTop: 5 }} numberOfLines={1}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
      </View>
    </Pressable>
  );
}

export default function AppsScreen() {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const layout = useResponsiveLayout();
  const targetCategory = useAppStore(s => s.targetCategory);
  const targetOutcome = useAppStore(s => s.targetOutcome);
  const setTargetCategory = useAppStore(s => s.setTargetCategory);
  const setTargetOutcome = useAppStore(s => s.setTargetOutcome);
  const { width: windowWidth } = useWindowDimensions();
  const [dashboard, setDashboard] = useState<TodayProductivity | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocalSearchResult[]>([]);
  const [lane, setLane] = useState<ToolLane>('all');

  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  const HEADER_HEIGHT = insets.top + 70;
  const contentMaxWidth = Math.min(windowWidth, layout.isDesktop ? 980 : layout.wideMaxWidth);
  const columns = layout.isDesktop ? 4 : layout.isTablet ? 3 : 2;
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
  }, [scrollY]);

  const appById = useMemo(() => new Map<string, MiniApp>(APPS.map(app => [app.id, app])), []);
  const selectedTarget = useMemo(() => getTargetCategory(targetCategory), [targetCategory]);

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
    ? APPS.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
    : [], [q, searching]);

  const laneApps = useMemo(() => {
    if (lane === 'all') return APPS;
    const def = TOOL_LANES.find(l => l.id === lane);
    if (!def?.apps) return APPS;
    return def.apps.map(id => appById.get(id)).filter((a): a is MiniApp => Boolean(a));
  }, [lane, appById]);

  const recentApps = useMemo(
    () => recents.map(id => appById.get(id)).filter((a): a is MiniApp => Boolean(a)).slice(0, 6),
    [recents, appById],
  );

  const renderGrid = (list: MiniApp[]) => {
    const grid: MiniApp[][] = [];
    for (let i = 0; i < list.length; i += columns) grid.push(list.slice(i, i + columns));
    return grid.map((row, ri) => (
      <View key={ri} style={{ flexDirection: 'row', gap: GAP }}>
        {row.map((app, ci) => <AppCard key={app.id} app={app} width={cardWidth} index={ri * columns + ci} onOpen={openTool} />)}
        {Array.from({ length: columns - row.length }).map((_, i) => <View key={`sp-${i}`} style={{ width: cardWidth }} />)}
      </View>
    ));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingTop: HEADER_HEIGHT, padding: PAD, gap: 18 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Unified search — tools + your content in one box */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          borderRadius: 16, paddingHorizontal: 14,
          backgroundColor: colors.surfaceHover,
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
        }}>
          <MagnifyingGlass color={colors.textMuted} size={18} />
          <TextInput
            value={query}
            onChangeText={runSearch}
            placeholder="Search tools, notes, habits…"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 13 }}
            returnKeyType="search"
          />
          {searching ? (
            <Pressable onPress={() => runSearch('')} hitSlop={8}><X color={colors.textMuted} size={16} /></Pressable>
          ) : null}
        </View>

        {searching ? (
          /* ── Search results ── */
          <Animated.View entering={FadeIn.duration(160)} style={{ gap: 18 }}>
            {toolMatches.length > 0 && (
              <View style={{ gap: GAP }}>
                <Eyebrow>Tools</Eyebrow>
                {renderGrid(toolMatches)}
              </View>
            )}
            {results.length > 0 && (
              <View>
                <Eyebrow>In your content</Eyebrow>
                {results.map((r, i) => (
                  <Pressable key={`${r.app}-${r.id}`} onPress={() => router.push(r.route as Href)}>
                    <View style={{ paddingVertical: 11, borderBottomWidth: i < results.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                      <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 14 }} numberOfLines={1}>{r.title}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{r.app} · {r.subtitle}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            {toolMatches.length === 0 && results.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
                <MagnifyingGlass color={colors.glassBorder} size={34} weight="thin" />
                <Text style={{ color: colors.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>No matches</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>Try a tool name, or a note, habit, or expense term.</Text>
              </View>
            )}
          </Animated.View>
        ) : (
          /* ── Browse ── */
          <>
            {/* Category lanes */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -PAD, paddingHorizontal: PAD }}>
              {TOOL_LANES.map(l => {
                const active = lane === l.id;
                return (
                  <Pressable key={l.id} onPress={() => { void Haptics.selectionAsync(); setLane(l.id); }} accessibilityRole="button" accessibilityState={{ selected: active }}>
                    <View style={{
                      height: 36, borderRadius: 999, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: active ? colors.accent : colors.surface,
                      borderWidth: StyleSheet.hairlineWidth, borderColor: active ? 'transparent' : colors.glassBorder,
                    }}>
                      <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 13.5, fontFamily: active ? 'Inter_600SemiBold' : 'Inter_500Medium' }}>{l.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Jump back in */}
            {lane === 'all' && recentApps.length > 0 && (
              <View>
                <Eyebrow>Jump back in</Eyebrow>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -PAD, paddingHorizontal: PAD }}>
                  {recentApps.map(app => <RecentChip key={app.id} app={app} onOpen={openTool} />)}
                </ScrollView>
              </View>
            )}

            {/* Tools grid */}
            <View style={{ gap: GAP }}>
              <Eyebrow>{lane === 'all' ? `All tools · ${APPS.length}` : `${TOOL_LANES.find(l => l.id === lane)?.label} · ${laneApps.length}`}</Eyebrow>
              {renderGrid(laneApps)}
            </View>

            {/* Today — condensed live strip */}
            {dashboard && (
              <View>
                <Eyebrow>Today</Eyebrow>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: GAP }} style={{ marginHorizontal: -PAD, paddingHorizontal: PAD }}>
                  <StatChip color={colors.accent} value={`${dashboard.habits.percent}%`} label="Habits" sub={`${dashboard.habits.done}/${dashboard.habits.total} done`} onPress={() => router.push('/mini-apps/habits' as Href)} />
                  <StatChip color="#8B5E7D" value={`$${formatMoney(Math.abs(dashboard.expenses.balance))}`} label="Weekly balance" sub={`$${formatMoney(dashboard.expenses.expense)} spent`} onPress={() => router.push('/mini-apps/expenses' as Href)} />
                  <StatChip color="#B08536" value={`${dashboard.notes.total}`} label="Notes" sub={dashboard.notes.recent[0]?.title ?? 'None yet'} onPress={() => router.push('/mini-apps/notes' as Href)} />
                  <StatChip color="#4E7A8B" value={`${dashboard.voiceMemos.total}`} label="Voice memos" sub={dashboard.voiceMemos.recent[0] ? formatMemoTime(dashboard.voiceMemos.recent[0].duration) : 'None yet'} onPress={() => router.push('/mini-apps/voice-memo' as Href)} />
                </ScrollView>
              </View>
            )}

            {/* Target — demoted to a single tappable card */}
            <View>
              <Eyebrow>Your target</Eyebrow>
              <Pressable onPress={() => router.push('/target-progress' as Href)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
                  <LinearGradient colors={[`${colors.accent}1F`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                  <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.accent}20` }}>
                    <Target color={colors.accent} size={22} weight="bold" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 15 }} numberOfLines={1}>{selectedTarget.label}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 1 }} numberOfLines={1}>{targetOutcome.trim() || selectedTarget.outcome}</Text>
                  </View>
                  <CaretRight color={colors.textMuted} size={16} />
                </View>
              </Pressable>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }} style={{ marginHorizontal: -PAD, paddingHorizontal: PAD }}>
                {TARGET_CATEGORIES.map(category => {
                  const active = category.id === selectedTarget.id;
                  return (
                    <Pressable key={category.id} onPress={() => setTargetCategory(category.id)} accessibilityRole="button" accessibilityState={{ selected: active }}>
                      <View style={{ height: 32, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: active ? colors.accent : colors.border, backgroundColor: active ? `${colors.accent}18` : colors.surface, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: active ? colors.accent : colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 12.5 }}>{category.label}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <TextInput
                value={targetOutcome}
                onChangeText={setTargetOutcome}
                placeholder="Name the output you want…"
                placeholderTextColor={colors.textMuted}
                style={{ color: colors.text, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12, backgroundColor: colors.surfaceHover, fontSize: 14.5, marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}
              />
            </View>

            <View style={{ alignItems: 'center', paddingVertical: 12, gap: 6 }}>
              <Pulse color={colors.textMuted} size={22} weight="thin" />
              <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '500' }}>No internet needed · Zero data collected</Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Sticky glass header */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_HEIGHT, overflow: 'hidden', zIndex: 10 }}>
        {useBlur && <AnimatedBlurView animatedProps={blurAnimatedProps} tint={tint} style={StyleSheet.absoluteFill} />}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, headerBgStyle]} />
        <View style={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingTop: insets.top + 10, paddingHorizontal: PAD, paddingBottom: 8 }}>
          <Text style={{ color: colors.text, fontSize: 26, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5 }}>Echo Tools</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>Think, capture, and post better</Text>
        </View>
        <Animated.View style={[{ position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.glassBorder }, headerBorderStyle]} />
      </View>
    </View>
  );
}
