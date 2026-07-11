import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, Pressable, TextInput, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import Animated, { Extrapolation, FadeInDown, interpolate, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Calculator, ArrowsLeftRight, Receipt, Timer,
  Key, Globe, BracketsCurly, FileText,
  Palette, Pulse,
  Camera, Microphone, NotePencil, CheckCircle, Wallet, DiceSix, VideoCamera,
  Barbell,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { getTodayProductivity, LocalProductivityApp, LocalSearchResult, searchLocalProductivity, TodayProductivity } from '../../lib/localSearch';
import { formatMoney } from '../../lib/expenses';
import { formatMemoTime } from '../../lib/voiceMemos';
import { EmptyState, Pill, SectionTitle } from '../../components/ui/Polish';
import { MOTION } from '../../lib/motion';
import { useResponsiveLayout } from '../../lib/responsive';

const PAD = 20;
const GAP = 12;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
type SearchFilter = 'all' | LocalProductivityApp;
type EchoPairing = { title: string; body: string; route: Href };

const SEARCH_FILTERS: { label: string; value: SearchFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Notes', value: 'notes' },
  { label: 'Habits', value: 'habits' },
  { label: 'Expenses', value: 'expenses' },
  { label: 'Memos', value: 'voice-memo' },
];

const ECHO_PAIRINGS: EchoPairing[] = [
  { title: 'Notes to posts', body: 'Capture a thought, then turn the strongest line into a public Echo.', route: '/mini-apps/notes' },
  { title: 'Voice memos to prompts', body: 'Record an idea first, then use Echo to refine it.', route: '/mini-apps/voice-memo' },
  { title: 'Habits to updates', body: 'Use streaks and milestones as material for progress updates.', route: '/mini-apps/habits' },
];

interface MiniApp {
  id: string;
  name: string;
  description: string;
  color: string;
  route: Href;
}

const APPS: MiniApp[] = [
  { id: 'calculator',    name: 'Calculator',   description: 'Scientific & history',    color: '#3B82F6', route: '/mini-apps/calculator' },
  { id: 'converter',     name: 'Converter',    description: 'Length · weight · temp',  color: '#10B981', route: '/mini-apps/converter' },
  { id: 'bill-splitter', name: 'Bill Splitter', description: 'Tip & split bills',      color: '#F59E0B', route: '/mini-apps/bill-splitter' },
  { id: 'pomodoro',      name: 'Pomodoro',     description: 'Focus & break timer',     color: '#EF4444', route: '/mini-apps/pomodoro' },
  { id: 'password-gen',  name: 'Passwords',    description: 'Secure generator',        color: '#8B5CF6', route: '/mini-apps/password-gen' },
  { id: 'world-clock',   name: 'World Clock',  description: 'Global timezones',        color: '#06B6D4', route: '/mini-apps/world-clock' },
  { id: 'json-formatter', name: 'JSON Tools',  description: 'Format & validate',       color: '#F97316', route: '/mini-apps/json-formatter' },
  { id: 'markdown',      name: 'Markdown',     description: 'Write & preview',         color: '#64748B', route: '/mini-apps/markdown' },
  { id: 'color-tools',   name: 'Colors',       description: 'HEX · RGB · palettes',   color: '#EC4899', route: '/mini-apps/color-tools' },
  { id: 'bmi',           name: 'BMI Calc',     description: 'Health & body metrics',   color: '#22C55E', route: '/mini-apps/bmi' },
  { id: 'camera',        name: 'Camera',       description: 'Photo & video capture',   color: '#6366F1', route: '/mini-apps/camera' },
  { id: 'voice-memo',    name: 'Voice Memo',   description: 'Record & play audio',     color: '#EF4444', route: '/mini-apps/voice-memo' },
  { id: 'notes',         name: 'Notes',        description: 'Quick notes & ideas',     color: '#F59E0B', route: '/mini-apps/notes' },
  { id: 'habits',        name: 'Habits',       description: 'Daily streaks & goals',   color: '#10B981', route: '/mini-apps/habits' },
  { id: 'expenses',      name: 'Expenses',     description: 'Income & budget log',     color: '#8B5CF6', route: '/mini-apps/expenses' },
  { id: 'fitness',       name: 'Fitness',      description: 'Meals · workouts · form', color: '#14B8A6', route: '/mini-apps/fitness' },
  { id: 'dice',          name: 'Dice & Coin',  description: 'Roll dice, flip coins',   color: '#F97316', route: '/mini-apps/dice' },
  { id: 'video-player',  name: 'Video Player', description: 'Pick & play videos',      color: '#0EA5E9', route: '/mini-apps/video-player' },
];

/** Darken a #RRGGBB color by a 0..1 factor. */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.round(c * (1 - factor)));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** iOS-style icon plate: gradient rounded-square + white fill glyph. */
function IconPlate({ id, color, size = 46 }: { id: string; color: string; size?: number }) {
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
    case 'camera':        return <Camera           {...p} />;
    case 'voice-memo':    return <Microphone       {...p} />;
    case 'notes':         return <NotePencil       {...p} />;
    case 'habits':        return <CheckCircle      {...p} />;
    case 'expenses':      return <Wallet           {...p} />;
    case 'fitness':       return <Barbell          {...p} />;
    case 'dice':          return <DiceSix          {...p} />;
    case 'video-player':  return <VideoCamera      {...p} />;
    default:              return <Calculator       {...p} />;
  }
}

function AppCard({ app, index, width }: { app: MiniApp; index: number; width: number }) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 24).duration(220).damping(MOTION.cardEntrance.damping).stiffness(MOTION.cardEntrance.stiffness).mass(MOTION.cardEntrance.mass)}
      style={{ width }}
    >
      <Pressable onPress={() => router.push(app.route)}>
        <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface }}>
          <LinearGradient
            colors={[`${app.color}26`, `${app.color}0A`, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={{ padding: 16 }}>
            <View style={{ marginBottom: 14 }}>
              <IconPlate id={app.id} color={app.color} />
            </View>
            <Text style={{ color: colors.text, fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 3 }} numberOfLines={1}>
              {app.name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }} numberOfLines={2}>
              {app.description}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function AppsScreen() {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const layout = useResponsiveLayout();
  const { width: windowWidth } = useWindowDimensions();
  const [dashboard, setDashboard] = useState<TodayProductivity | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocalSearchResult[]>([]);
  const [filter, setFilter] = useState<SearchFilter>('all');

  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  const HEADER_HEIGHT = insets.top + 70;
  const contentMaxWidth = Math.min(windowWidth, layout.isDesktop ? 980 : layout.wideMaxWidth);
  const columns = layout.isDesktop ? 3 : layout.isTablet ? 3 : 2;
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

  const rows: MiniApp[][] = [];
  for (let i = 0; i < APPS.length; i += columns) rows.push(APPS.slice(i, i + columns));

  useFocusEffect(
    useCallback(() => {
      getTodayProductivity().then(setDashboard).catch(() => setDashboard(null));
    }, []),
  );

  const runLocalSearch = (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    searchLocalProductivity(text, 6).then(setResults).catch(() => setResults([]));
  };
  const filteredResults = filter === 'all' ? results : results.filter(result => result.app === filter);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Ambient gradient */}

      <ScrollView
        contentContainerStyle={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingTop: HEADER_HEIGHT, padding: PAD, gap: GAP }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {dashboard && (
          <Animated.View entering={FadeInDown.delay(40).duration(220)} style={{ gap: 12, marginBottom: 8 }}>
            <SectionTitle title="Support Your Echoes" caption="Local tools that feed ideas back into chat and posts" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
              {([
                { route: '/mini-apps/habits' as Href, value: `${dashboard.habits.percent}%`, label: 'Habits', sub: `${dashboard.habits.done}/${dashboard.habits.total} done` },
                { route: '/mini-apps/expenses' as Href, value: `$${formatMoney(Math.abs(dashboard.expenses.balance))}`, label: 'Weekly balance', sub: `$${formatMoney(dashboard.expenses.expense)} spent` },
                { route: '/mini-apps/notes' as Href, value: `${dashboard.notes.total}`, label: 'Notes', sub: dashboard.notes.recent[0]?.title ?? 'No recent notes' },
                { route: '/mini-apps/voice-memo' as Href, value: `${dashboard.voiceMemos.total}`, label: 'Voice memos', sub: dashboard.voiceMemos.recent[0] ? formatMemoTime(dashboard.voiceMemos.recent[0].duration) : 'No recordings' },
              ]).map(stat => (
                <Pressable key={stat.label} onPress={() => router.push(stat.route)}>
                  <View style={{ width: cardWidth, borderRadius: 20, padding: 15, backgroundColor: colors.surface, overflow: 'hidden' }}>
                    <LinearGradient
                      colors={[`${colors.accent}24`, `${colors.accent}08`, 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0.9, y: 1 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                    <Text style={{ color: colors.text, fontSize: 26, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5 }}>{stat.value}</Text>
                    <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 5 }}>{stat.label}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>{stat.sub}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <View>
              {([
                { route: '/mini-apps/habits' as Href, title: 'Habits due today', sub: dashboard.habits.remaining.length ? dashboard.habits.remaining.join(', ') : 'All habits complete' },
                { route: '/mini-apps/notes' as Href, title: 'Recent notes', sub: dashboard.notes.recent.map(note => note.title).join(', ') || 'No recent notes' },
                { route: '/mini-apps/expenses' as Href, title: 'Biggest expense category', sub: dashboard.expenses.biggestCategory ? `${dashboard.expenses.biggestCategory.category} - $${formatMoney(dashboard.expenses.biggestCategory.amount)}` : 'No expenses this week' },
                { route: '/mini-apps/voice-memo' as Href, title: 'Latest voice memo', sub: dashboard.voiceMemos.recent[0] ? `${dashboard.voiceMemos.recent[0].title} - ${formatMemoTime(dashboard.voiceMemos.recent[0].duration)}` : 'No recordings' },
              ]).map((row, i, arr) => (
                <Pressable key={row.title} onPress={() => router.push(row.route)}>
                  <View style={{ paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                    <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>{row.title}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }} numberOfLines={1}>{row.sub}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(55).duration(220)} style={{ gap: 10, marginBottom: 8 }}>
          <SectionTitle title="Works with Echo" caption="Use these tools to prepare posts, prompts, and updates" />
          <View>
            {ECHO_PAIRINGS.map((item, i) => (
              <Pressable key={item.title} onPress={() => router.push(item.route)}>
                <View style={{ paddingVertical: 12, borderBottomWidth: i < ECHO_PAIRINGS.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>{item.title}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 18 }}>{item.body}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).duration(220)} style={{ gap: 10, marginBottom: 8 }}>
          <TextInput
            value={query}
            onChangeText={runLocalSearch}
            placeholder="Search notes, habits, expenses, memos..."
            placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: colors.surfaceHover, fontSize: 15 }}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {SEARCH_FILTERS.map(item => {
              const active = filter === item.value;
              return (
                <Pill key={item.value} label={item.label} active={active} onPress={() => setFilter(item.value)} />
              );
            })}
          </ScrollView>
          {filteredResults.map((result, i) => (
            <Pressable key={`${result.app}-${result.id}`} onPress={() => router.push(result.route as Href)}>
              <View style={{ paddingVertical: 11, borderBottomWidth: i < filteredResults.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 14 }} numberOfLines={1}>{result.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{result.app} · {result.subtitle}</Text>
              </View>
            </Pressable>
          ))}
          {query.trim() && filteredResults.length === 0 ? <EmptyState title="No local matches" caption="Try a different note, habit, expense, or memo term." /> : null}
        </Animated.View>

        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: GAP }}>
            {row.map((app, ci) => <AppCard key={app.id} app={app} width={cardWidth} index={ri * columns + ci} />)}
            {Array.from({ length: columns - row.length }).map((_, i) => <View key={`spacer-${i}`} style={{ width: cardWidth }} />)}
          </View>
        ))}
        <View style={{ alignItems: 'center', paddingVertical: 20, gap: 6 }}>
          <Pulse color={colors.textMuted} size={24} weight="thin" />
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>
            No internet needed · Zero data collected
          </Text>
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: HEADER_HEIGHT,
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        {useBlur && (
          <AnimatedBlurView
            animatedProps={blurAnimatedProps}
            tint={tint}
            style={StyleSheet.absoluteFill}
          />
        )}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.bg },
            headerBgStyle,
          ]}
        />

        <View style={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingTop: insets.top + 10, paddingHorizontal: PAD, paddingBottom: 8 }}>
          <Text style={{ color: colors.text, fontSize: 26, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5 }}>
            Echo Tools
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
            Utilities that help you think, capture, and post better
          </Text>
        </View>

        <Animated.View
          style={[{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.glassBorder,
          }, headerBorderStyle]}
        />
      </View>
    </View>
  );
}
