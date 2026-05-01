// @ts-nocheck
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, StyleSheet, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Calculator, ArrowsLeftRight, Receipt, Timer,
  Key, Globe, BracketsCurly, FileText,
  Palette, Pulse,
  Camera, Microphone, NotePencil, CheckCircle, Wallet, DiceSix, VideoCamera,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { getTodayProductivity, searchLocalProductivity } from '../../lib/localSearch';
import { formatMoney } from '../../lib/expenses';
import { formatMemoTime } from '../../lib/voiceMemos';

const { width } = Dimensions.get('window');
const PAD = 20;
const GAP = 12;
const CARD = (width - PAD * 2 - GAP) / 2;

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
      entering={FadeInDown.delay(index * 20).springify().damping(22).stiffness(600)}
      style={{ width: CARD }}
    >
      <Pressable
        onPress={() => router.push(app.route as any)}
        style={({ pressed }) => ({
          borderRadius: 24,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: pressed ? app.color + '66' : colors.glassBorder,
          transform: [{ scale: pressed ? 0.95 : 1 }],
          shadowColor: app.color,
          shadowOpacity: pressed ? 0.28 : 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        })}
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
      </Pressable>
    </Animated.View>
  );
}

export default function AppsScreen() {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [dashboard, setDashboard] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  const HEADER_HEIGHT = insets.top + 70;

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Ambient gradient */}
      <LinearGradient
        colors={colors.ambientGradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.55 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: HEADER_HEIGHT, padding: PAD, gap: GAP }}
        showsVerticalScrollIndicator={false}
      >
        {dashboard && (
          <Animated.View entering={FadeInDown.delay(40).springify()} style={{ gap: 12, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>Today</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Local dashboard</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
              <Pressable onPress={() => router.push('/mini-apps/habits')} style={{ width: CARD, borderRadius: 18, padding: 14, backgroundColor: '#10B98118', borderWidth: StyleSheet.hairlineWidth, borderColor: '#10B98144' }}>
                <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 24 }}>{dashboard.habits.percent}%</Text>
                <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>Habits</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dashboard.habits.done}/{dashboard.habits.total} done</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/mini-apps/expenses')} style={{ width: CARD, borderRadius: 18, padding: 14, backgroundColor: '#8B5CF618', borderWidth: StyleSheet.hairlineWidth, borderColor: '#8B5CF644' }}>
                <Text style={{ color: dashboard.expenses.balance >= 0 ? '#10B981' : '#EF4444', fontWeight: '900', fontSize: 22 }}>${formatMoney(Math.abs(dashboard.expenses.balance))}</Text>
                <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>Weekly balance</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>${formatMoney(dashboard.expenses.expense)} spent</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/mini-apps/notes')} style={{ width: CARD, borderRadius: 18, padding: 14, backgroundColor: '#F59E0B18', borderWidth: StyleSheet.hairlineWidth, borderColor: '#F59E0B44' }}>
                <Text style={{ color: '#F59E0B', fontWeight: '900', fontSize: 24 }}>{dashboard.notes.total}</Text>
                <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>Notes</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>{dashboard.notes.recent[0]?.title ?? 'No recent notes'}</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/mini-apps/voice-memo')} style={{ width: CARD, borderRadius: 18, padding: 14, backgroundColor: '#EF444418', borderWidth: StyleSheet.hairlineWidth, borderColor: '#EF444444' }}>
                <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 24 }}>{dashboard.voiceMemos.total}</Text>
                <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>Voice memos</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dashboard.voiceMemos.recent[0] ? formatMemoTime(dashboard.voiceMemos.recent[0].duration) : 'No recordings'}</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(70).springify()} style={{ gap: 10, marginBottom: 8 }}>
          <TextInput
            value={query}
            onChangeText={runLocalSearch}
            placeholder="Search notes, habits, expenses, memos..."
            placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
          />
          {results.map(result => (
            <Pressable key={`${result.app}-${result.id}`} onPress={() => router.push(result.route)} style={{ borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, padding: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
              <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{result.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{result.app} · {result.subtitle}</Text>
            </Pressable>
          ))}
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
          <BlurView
            intensity={70}
            tint={tint}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.bg, opacity: useBlur ? 0.28 : 0.97 },
          ]}
        />

        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: PAD, paddingBottom: 8 }}>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 }}>
            Mini Apps
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 1 }}>
            17 built-in utilities, always offline
          </Text>
        </View>

        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.glassBorder,
          }}
        />
      </View>
    </View>
  );
}
