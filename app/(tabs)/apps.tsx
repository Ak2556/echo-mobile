import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Dimensions, StyleSheet, Platform, TextInput, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { Extrapolation, FadeInDown, interpolate, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import {
  Calculator, ArrowsLeftRight, Receipt, Timer,
  Key, Globe, BracketsCurly, FileText,
  Palette, Pulse,
  Camera, Microphone, NotePencil, CheckCircle, Wallet, DiceSix, VideoCamera,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { getTodayProductivity, LocalProductivityApp, LocalSearchResult, searchLocalProductivity, TodayProductivity } from '../../lib/localSearch';
import { formatMoney } from '../../lib/expenses';
import { formatMemoTime } from '../../lib/voiceMemos';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { EmptyState, Pill, SectionTitle } from '../../components/ui/Polish';
import { MOTION } from '../../lib/motion';

const { width } = Dimensions.get('window');
const PAD = 20;
const GAP = 12;
const CARD = (width - PAD * 2 - GAP) / 2;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
type SearchFilter = 'all' | LocalProductivityApp;

const SEARCH_FILTERS: { label: string; value: SearchFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Notes', value: 'notes' },
  { label: 'Habits', value: 'habits' },
  { label: 'Expenses', value: 'expenses' },
  { label: 'Memos', value: 'voice-memo' },
];

interface MiniApp {
  id: string;
  name: string;
  description: string;
  color: string;
  route: string;
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
  { id: 'dice',          name: 'Dice & Coin',  description: 'Roll dice, flip coins',   color: '#F97316', route: '/mini-apps/dice' },
  { id: 'video-player',  name: 'Video Player', description: 'Pick & play videos',      color: '#0EA5E9', route: '/mini-apps/video-player' },
];

function AppIcon({ id, color }: { id: string; color: string }) {
  const p = { color, size: 28, weight: 'duotone' as const };
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
    case 'dice':          return <DiceSix          {...p} />;
    case 'video-player':  return <VideoCamera      {...p} />;
    default:              return <Calculator       {...p} />;
  }
}

function AppCard({ app, index }: { app: MiniApp; index: number }) {
  const { colors, reduceAnimations } = useTheme();
  const router = useRouter();
  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 24).springify().damping(MOTION.cardEntrance.damping).stiffness(MOTION.cardEntrance.stiffness).mass(MOTION.cardEntrance.mass)}
      style={{ width: CARD }}
    >
      <AnimatedPressable
        onPress={() => router.push(app.route as any)}
        depth="medium"
        fadeOnPress
        style={{
          borderRadius: 24,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
          shadowColor: app.color,
          shadowOpacity: 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        {/* Glass base */}
        {useBlur && (
          <BlurView
            intensity={40}
            tint={tint}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: useBlur
                ? (colors.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.30)')
                : colors.surface,
            },
          ]}
        />

        {/* Accent glow spot */}
        <View
          style={{
            position: 'absolute',
            top: -20,
            right: -20,
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: app.color + '18',
          }}
        />

        {/* Content */}
        <View style={{ padding: 18 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              backgroundColor: app.color + '20',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: app.color + '40',
            }}
          >
            <AppIcon id={app.id} color={app.color} />
          </View>

          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 3 }} numberOfLines={1}>
            {app.name}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }} numberOfLines={2}>
            {app.description}
          </Text>

          <View
            style={{
              position: 'absolute',
              bottom: 14,
              right: 14,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: app.color + '66',
            }}
          />
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function AppsScreen() {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<TodayProductivity | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocalSearchResult[]>([]);
  const [filter, setFilter] = useState<SearchFilter>('all');

  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  const HEADER_HEIGHT = insets.top + 70;
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
  for (let i = 0; i < APPS.length; i += 2) rows.push(APPS.slice(i, i + 2));

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
        contentContainerStyle={{ paddingTop: HEADER_HEIGHT, padding: PAD, gap: GAP }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {dashboard && (
          <Animated.View entering={FadeInDown.delay(40).springify()} style={{ gap: 12, marginBottom: 8 }}>
            <SectionTitle title="Support Your Echoes" caption="Local tools that feed ideas back into chat and posts" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
              <AnimatedPressable depth="medium" fadeOnPress onPress={() => router.push('/mini-apps/habits')} style={{ width: CARD, borderRadius: 18, padding: 14, backgroundColor: `${colors.success}18`, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.success}44` }}>
                <Text style={{ color: colors.success, fontWeight: '900', fontSize: 24 }}>{dashboard.habits.percent}%</Text>
                <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>Habits</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dashboard.habits.done}/{dashboard.habits.total} done</Text>
              </AnimatedPressable>
              <AnimatedPressable depth="medium" fadeOnPress onPress={() => router.push('/mini-apps/expenses')} style={{ width: CARD, borderRadius: 18, padding: 14, backgroundColor: '#8B5CF618', borderWidth: StyleSheet.hairlineWidth, borderColor: '#8B5CF644' }}>
                <Text style={{ color: dashboard.expenses.balance >= 0 ? colors.success : colors.danger, fontWeight: '900', fontSize: 22 }}>${formatMoney(Math.abs(dashboard.expenses.balance))}</Text>
                <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>Weekly balance</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>${formatMoney(dashboard.expenses.expense)} spent</Text>
              </AnimatedPressable>
              <AnimatedPressable depth="medium" fadeOnPress onPress={() => router.push('/mini-apps/notes')} style={{ width: CARD, borderRadius: 18, padding: 14, backgroundColor: '#F59E0B18', borderWidth: StyleSheet.hairlineWidth, borderColor: '#F59E0B44' }}>
                <Text style={{ color: '#F59E0B', fontWeight: '900', fontSize: 24 }}>{dashboard.notes.total}</Text>
                <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>Notes</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>{dashboard.notes.recent[0]?.title ?? 'No recent notes'}</Text>
              </AnimatedPressable>
              <AnimatedPressable depth="medium" fadeOnPress onPress={() => router.push('/mini-apps/voice-memo')} style={{ width: CARD, borderRadius: 18, padding: 14, backgroundColor: `${colors.danger}18`, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.danger}44` }}>
                <Text style={{ color: colors.danger, fontWeight: '900', fontSize: 24 }}>{dashboard.voiceMemos.total}</Text>
                <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>Voice memos</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dashboard.voiceMemos.recent[0] ? formatMemoTime(dashboard.voiceMemos.recent[0].duration) : 'No recordings'}</Text>
              </AnimatedPressable>
            </View>
            <View style={{ gap: 8 }}>
              <AnimatedPressable depth="soft" fadeOnPress onPress={() => router.push('/mini-apps/habits' as any)} style={{ borderRadius: 14, padding: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>Habits due today</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }} numberOfLines={1}>{dashboard.habits.remaining.length ? dashboard.habits.remaining.join(', ') : 'All habits complete'}</Text>
              </AnimatedPressable>
              <AnimatedPressable depth="soft" fadeOnPress onPress={() => router.push('/mini-apps/notes' as any)} style={{ borderRadius: 14, padding: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>Recent notes</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }} numberOfLines={1}>{dashboard.notes.recent.map(note => note.title).join(', ') || 'No recent notes'}</Text>
              </AnimatedPressable>
              <AnimatedPressable depth="soft" fadeOnPress onPress={() => router.push('/mini-apps/expenses' as any)} style={{ borderRadius: 14, padding: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>Biggest expense category</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{dashboard.expenses.biggestCategory ? `${dashboard.expenses.biggestCategory.category} - $${formatMoney(dashboard.expenses.biggestCategory.amount)}` : 'No expenses this week'}</Text>
              </AnimatedPressable>
              <AnimatedPressable depth="soft" fadeOnPress onPress={() => router.push('/mini-apps/voice-memo' as any)} style={{ borderRadius: 14, padding: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>Latest voice memo</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }} numberOfLines={1}>{dashboard.voiceMemos.recent[0] ? `${dashboard.voiceMemos.recent[0].title} - ${formatMemoTime(dashboard.voiceMemos.recent[0].duration)}` : 'No recordings'}</Text>
              </AnimatedPressable>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(55).springify()} style={{ gap: 10, marginBottom: 8 }}>
          <SectionTitle title="Best paired with Echo" caption="Use these when you want something worth posting or messaging about" />
          <View style={{ gap: 8 }}>
            {[
              { title: 'Notes -> post ideas', body: 'Capture a thought, then turn the strongest line into a public Echo.', route: '/mini-apps/notes' },
              { title: 'Voice memos -> conversation starters', body: 'Record messy thinking first, then ask Echo to shape it.', route: '/mini-apps/voice-memo' },
              { title: 'Habits -> progress updates', body: 'Use streaks and milestones as material for creator updates.', route: '/mini-apps/habits' },
            ].map(item => (
              <AnimatedPressable key={item.title} depth="soft" fadeOnPress onPress={() => router.push(item.route as any)} style={{ borderRadius: 16, padding: 14, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>{item.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 18 }}>{item.body}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).springify()} style={{ gap: 10, marginBottom: 8 }}>
          <TextInput
            value={query}
            onChangeText={runLocalSearch}
            placeholder="Search notes, habits, expenses, memos..."
            placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {SEARCH_FILTERS.map(item => {
              const active = filter === item.value;
              return (
                <Pill key={item.value} label={item.label} active={active} onPress={() => setFilter(item.value)} />
              );
            })}
          </ScrollView>
          {filteredResults.map(result => (
            <AnimatedPressable depth="soft" fadeOnPress key={`${result.app}-${result.id}`} onPress={() => router.push(result.route as any)} style={{ borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, padding: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
              <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{result.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{result.app} · {result.subtitle}</Text>
            </AnimatedPressable>
          ))}
          {query.trim() && filteredResults.length === 0 ? <EmptyState title="No local matches" caption="Try a different note, habit, expense, or memo term." /> : null}
        </Animated.View>

        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: GAP }}>
            {row.map((app, ci) => <AppCard key={app.id} app={app} index={ri * 2 + ci} />)}
            {row.length === 1 && <View style={{ width: CARD }} />}
          </View>
        ))}
        <View style={{ alignItems: 'center', paddingVertical: 20, gap: 6 }}>
          <Text style={{ fontSize: 24 }}>⚡</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>
            No internet needed · Zero data collected
          </Text>
        </View>
      </ScrollView>

      {/* Glass header */}
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

        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: PAD, paddingBottom: 8 }}>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 }}>
            Echo Tools
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 1 }}>
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
