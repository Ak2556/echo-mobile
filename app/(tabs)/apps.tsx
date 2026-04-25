import React from 'react';
import { View, Text, ScrollView, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Calculator, ArrowsLeftRight, Receipt, Timer,
  Key, Globe, Braces, FileText,
  Palette, Activity,
  Camera, Microphone, NotePencil, CheckCircle, Wallet, DiceSix,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

const { width } = Dimensions.get('window');
const PAD = 20;
const GAP = 12;
const CARD = (width - PAD * 2 - GAP) / 2;

interface MiniApp {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ color: string; size: number; weight?: string }>;
  color: string;
  route: string;
  emoji: string;
}

const APPS: MiniApp[] = [
  { id: 'calculator', name: 'Calculator', description: 'Scientific & history', icon: Calculator, color: '#3B82F6', route: '/mini-apps/calculator', emoji: '🔢' },
  { id: 'converter', name: 'Converter', description: 'Length · weight · temp', icon: ArrowsLeftRight, color: '#10B981', route: '/mini-apps/converter', emoji: '🔄' },
  { id: 'bill-splitter', name: 'Bill Splitter', description: 'Tip & split bills', icon: Receipt, color: '#F59E0B', route: '/mini-apps/bill-splitter', emoji: '🧾' },
  { id: 'pomodoro', name: 'Pomodoro', description: 'Focus & break timer', icon: Timer, color: '#EF4444', route: '/mini-apps/pomodoro', emoji: '🍅' },
  { id: 'password-gen', name: 'Passwords', description: 'Secure generator', icon: Key, color: '#8B5CF6', route: '/mini-apps/password-gen', emoji: '🔐' },
  { id: 'world-clock', name: 'World Clock', description: 'Global timezones', icon: Globe, color: '#06B6D4', route: '/mini-apps/world-clock', emoji: '🌍' },
  { id: 'json-formatter', name: 'JSON Tools', description: 'Format & validate', icon: Braces, color: '#F97316', route: '/mini-apps/json-formatter', emoji: '{ }' },
  { id: 'markdown', name: 'Markdown', description: 'Write & preview', icon: FileText, color: '#64748B', route: '/mini-apps/markdown', emoji: '✍️' },
  { id: 'color-tools', name: 'Colors', description: 'HEX · RGB · palettes', icon: Palette, color: '#EC4899', route: '/mini-apps/color-tools', emoji: '🎨' },
  { id: 'bmi', name: 'BMI Calc', description: 'Health & body metrics', icon: Activity, color: '#22C55E', route: '/mini-apps/bmi', emoji: '⚖️' },
  { id: 'camera', name: 'Camera', description: 'Photo & video capture', icon: Camera, color: '#6366F1', route: '/mini-apps/camera', emoji: '📸' },
  { id: 'voice-memo', name: 'Voice Memo', description: 'Record & play audio', icon: Microphone, color: '#EF4444', route: '/mini-apps/voice-memo', emoji: '🎙' },
  { id: 'notes', name: 'Notes', description: 'Quick notes & ideas', icon: NotePencil, color: '#F59E0B', route: '/mini-apps/notes', emoji: '📝' },
  { id: 'habits', name: 'Habits', description: 'Daily streaks & goals', icon: CheckCircle, color: '#10B981', route: '/mini-apps/habits', emoji: '🔥' },
  { id: 'expenses', name: 'Expenses', description: 'Income & budget log', icon: Wallet, color: '#8B5CF6', route: '/mini-apps/expenses', emoji: '💰' },
  { id: 'dice', name: 'Dice & Coin', description: 'Roll dice, flip coins', icon: DiceSix, color: '#F97316', route: '/mini-apps/dice', emoji: '🎲' },
];

function AppCard({ app, index }: { app: MiniApp; index: number }) {
  const { colors, radius } = useTheme();
  const router = useRouter();
  const Icon = app.icon;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify().damping(14)} style={{ width: CARD }}>
      <Pressable
        onPress={() => router.push(app.route as any)}
        style={({ pressed }) => ({
          backgroundColor: colors.surface,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: pressed ? app.color + '55' : colors.border,
          padding: 18,
          transform: [{ scale: pressed ? 0.95 : 1 }],
          shadowColor: app.color,
          shadowOpacity: pressed ? 0.25 : 0,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
          overflow: 'hidden',
        })}
      >
        {/* Glow spot top-right */}
        <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: app.color + '18' }} />

        {/* Icon */}
        <View style={{
          width: 56, height: 56, borderRadius: 18,
          backgroundColor: app.color + '20',
          alignItems: 'center', justifyContent: 'center', marginBottom: 14,
          borderWidth: 1, borderColor: app.color + '30',
        }}>
          <Icon color={app.color} size={28} weight="duotone" />
        </View>

        {/* Text */}
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 3 }} numberOfLines={1}>{app.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }} numberOfLines={2}>{app.description}</Text>

        {/* Accent dot */}
        <View style={{ position: 'absolute', bottom: 14, right: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: app.color + '66' }} />
      </Pressable>
    </Animated.View>
  );
}

export default function AppsScreen() {
  const { colors, fontSizes } = useTheme();

  const rows: MiniApp[][] = [];
  for (let i = 0; i < APPS.length; i += 2) rows.push(APPS.slice(i, i + 2));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: PAD, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -1 }}>Mini Apps</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 2 }}>16 built-in utilities, always offline</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: PAD, gap: GAP }} showsVerticalScrollIndicator={false}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: GAP }}>
            {row.map((app, ci) => <AppCard key={app.id} app={app} index={ri * 2 + ci} />)}
            {row.length === 1 && <View style={{ width: CARD }} />}
          </View>
        ))}

        {/* Footer */}
        <View style={{ alignItems: 'center', paddingVertical: 20, gap: 6 }}>
          <Text style={{ fontSize: 24 }}>⚡</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>No internet needed · Zero data collected</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
