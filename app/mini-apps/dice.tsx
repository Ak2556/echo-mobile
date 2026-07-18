import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle,
  withSpring, withSequence, withTiming,
} from 'react-native-reanimated';
import { ArrowClockwise, DiceSix } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';

// Warm editorial palette (lib/avatarPalette.ts) — one hue per die.
const DICE = [
  { sides: 4,  label: 'D4',  color: '#A04E4E' },
  { sides: 6,  label: 'D6',  color: '#B08536' },
  { sides: 8,  label: 'D8',  color: '#7A8B4E' },
  { sides: 10, label: 'D10', color: '#4E8B7A' },
  { sides: 12, label: 'D12', color: '#8B5E7D' },
  { sides: 20, label: 'D20', color: '#5E748B' },
];

interface HistoryEntry { die: string; result: number; color: string; ts: number }

function DieFace({ value, sides, color }: { value: number; sides: number; color: string }) {
  const layouts: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[25, 50], [75, 50]],
    3: [[25, 50], [50, 50], [75, 50]],
    4: [[25, 35], [75, 35], [25, 65], [75, 65]],
    5: [[25, 35], [75, 35], [50, 50], [25, 65], [75, 65]],
    6: [[25, 30], [75, 30], [25, 50], [75, 50], [25, 70], [75, 70]],
  };
  const dots = layouts[value] ?? [];

  if (sides === 6 && value <= 6) {
    return (
      <View style={{ width: 100, height: 100, borderRadius: 22, backgroundColor: color + '18', borderWidth: 2.5, borderColor: color + '55', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {dots.map(([x, y], i) => (
          <View key={i} style={{ position: 'absolute', left: `${x}%` as any, top: `${y}%` as any, width: 14, height: 14, borderRadius: 7, backgroundColor: color, marginLeft: -7, marginTop: -7 }} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ width: 100, height: 100, borderRadius: 22, backgroundColor: color + '18', borderWidth: 2.5, borderColor: color + '55', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 36, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1 }}>{value}</Text>
    </View>
  );
}

function ChancePulse({ accent, selectedDie, diceCount, history }: { accent: string; selectedDie: typeof DICE[number]; diceCount: number; history: HistoryEntry[] }) {
  const { colors } = useTheme();
  const max = selectedDie.sides * diceCount;
  const average = ((selectedDie.sides + 1) / 2) * diceCount;
  const coinFlips = history.filter(item => item.die === 'Coin').length;
  const stats = [
    { label: 'Range', value: `${diceCount}-${max}`, detail: 'possible' },
    { label: 'Average', value: `${average % 1 ? average.toFixed(1) : average}`, detail: 'expected' },
    { label: 'Coin', value: `${coinFlips}`, detail: 'flips' },
  ];
  return (
    <GlassPanel variant="light" borderRadius={22} contentStyle={{ padding: 16, gap: 13 }} style={{ marginBottom: 14, borderColor: `${accent}38` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: `${accent}20`, alignItems: 'center', justifyContent: 'center' }}>
          <DiceSix color={accent} size={22} weight="duotone" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>Chance board</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 }}>Rolls, odds, record.</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.map(stat => (
          <View key={stat.label} style={{ flex: 1, minHeight: 62, borderRadius: 16, padding: 10, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
            <Text style={{ color: accent, fontSize: 17, fontWeight: '900' }} numberOfLines={1}>{stat.value}</Text>
            <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: '900', marginTop: 4 }}>{stat.label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '700', marginTop: 1 }}>{stat.detail}</Text>
          </View>
        ))}
      </View>
    </GlassPanel>
  );
}

export default function DiceApp() {
  const { colors } = useTheme();
  const [selectedDie, setSelectedDie] = useState(DICE[1]);
  const [result, setResult] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [coinFace, setCoinFace] = useState<'heads' | 'tails' | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [diceCount, setDiceCount] = useState(1);

  const dieScale = useSharedValue(1);
  const dieRotate = useSharedValue(0);
  const coinScale = useSharedValue(1);

  const dieStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dieScale.value }, { rotate: `${dieRotate.value}deg` }],
  }));
  const coinStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coinScale.value }],
  }));

  const rollDie = useCallback(() => {
    if (rolling) return;
    setRolling(true); setResult(null);
    dieScale.value = withSequence(withTiming(0.7, { duration: 80 }), withSpring(1.2, { damping: 6 }), withSpring(1, { damping: 10 }));
    dieRotate.value = withSequence(withTiming(Math.random() > 0.5 ? 20 : -20, { duration: 100 }), withTiming(0, { duration: 200 }));
    setTimeout(() => {
      const rolls: number[] = [];
      for (let i = 0; i < diceCount; i++) rolls.push(Math.floor(Math.random() * selectedDie.sides) + 1);
      const total = rolls.reduce((a, b) => a + b, 0);
      setResult(total); setRolling(false);
      setHistory(prev => [{ die: diceCount > 1 ? `${diceCount}×${selectedDie.label}` : selectedDie.label, result: total, color: selectedDie.color, ts: Date.now() }, ...prev.slice(0, 19)]);
    }, 320);
  }, [rolling, selectedDie, diceCount, dieScale, dieRotate]);

  const flipCoin = () => {
    coinScale.value = withSequence(withTiming(0.5, { duration: 150 }), withSpring(1.1, { damping: 6 }), withSpring(1));
    setTimeout(() => {
      const face = Math.random() > 0.5 ? 'heads' : 'tails';
      setCoinFace(face);
      setHistory(prev => [{ die: 'Coin', result: face === 'heads' ? 1 : 0, color: '#B08536', ts: Date.now() }, ...prev.slice(0, 19)]);
    }, 200);
  };

  const ClearBtn = (
    <AnimatedPressable onPress={() => { setHistory([]); setResult(null); setCoinFace(null); }} scaleValue={0.88} haptic="light">
      <ArrowClockwise color={colors.textMuted} size={20} />
    </AnimatedPressable>
  );

  return (
    <MiniAppShell title="Dice & Coin" subtitle="Chance" headerRight={ClearBtn}>
      <MiniCommandDeck
        accent={selectedDie.color}
        title="Fair random decisions"
        subtitle="Roll, flip, explain, share."
        metrics={[
          { label: 'Die', value: selectedDie.label, detail: `${selectedDie.sides} sides` },
          { label: 'Count', value: `${diceCount}`, detail: 'dice' },
          { label: 'History', value: `${history.length}`, detail: 'logged' },
        ]}
        chips={['Games', 'Draws', 'Group proof']}
      />
      <ChancePulse accent={selectedDie.color} selectedDie={selectedDie} diceCount={diceCount} history={history} />
      {/* Die selector */}
      <GlassPanel variant="medium" borderRadius={20} contentStyle={{ padding: 16 }} style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>SELECT DIE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {DICE.map(d => (
            <Pressable key={d.label} onPress={() => { setSelectedDie(d); setResult(null); }}>
              <View style={{
                paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14,
                backgroundColor: selectedDie.label === d.label ? d.color + '22' : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                borderWidth: selectedDie.label === d.label ? 2 : StyleSheet.hairlineWidth,
                borderColor: selectedDie.label === d.label ? d.color : colors.glassBorder,
              }}>
                <Text style={{ color: selectedDie.label === d.label ? d.color : colors.textMuted, fontWeight: '800', fontSize: 15 }}>{d.label}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </GlassPanel>

      {/* Dice count */}
      <GlassPanel variant="medium" borderRadius={20} contentStyle={{ padding: 16 }} style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>NUMBER OF DICE</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <Pressable key={n} onPress={() => { setDiceCount(n); setResult(null); }}>
              <View style={{
                width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: diceCount === n ? selectedDie.color + '22' : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                borderWidth: diceCount === n ? 2 : StyleSheet.hairlineWidth,
                borderColor: diceCount === n ? selectedDie.color : colors.glassBorder,
              }}>
                <Text style={{ color: diceCount === n ? selectedDie.color : colors.textMuted, fontWeight: '800', fontSize: 16 }}>{n}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </GlassPanel>

      {/* Roll area */}
      <View style={{ alignItems: 'center', gap: 20, marginBottom: 14 }}>
        <Animated.View style={dieStyle}>
          <Pressable onPress={rollDie}>
            {result !== null && diceCount === 1
              ? <DieFace value={result} sides={selectedDie.sides} color={selectedDie.color} />
              : (
                <View style={{ width: 100, height: 100, borderRadius: 22, backgroundColor: selectedDie.color + '18', borderWidth: 2.5, borderColor: selectedDie.color + '55', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <DiceSix color={selectedDie.color} size={44} weight="duotone" />
                  {result !== null && diceCount > 1 && <Text style={{ color: selectedDie.color, fontSize: 18, fontWeight: '900' }}>{result}</Text>}
                </View>
              )}
          </Pressable>
        </Animated.View>

        {result !== null && (
          <Animated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'center' }}>
            <Text style={{ color: selectedDie.color, fontSize: 52, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1.5 }}>{result}</Text>
            {diceCount > 1 && <Text style={{ color: colors.textMuted, fontSize: 14 }}>{diceCount}× {selectedDie.label} · total</Text>}
          </Animated.View>
        )}

        <AnimatedPressable onPress={rollDie} disabled={rolling} scaleValue={0.95} haptic="heavy" style={{ backgroundColor: selectedDie.color, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 48, shadowColor: selectedDie.color, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, opacity: rolling ? 0.7 : 1 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 0.5 }}>
            {rolling ? 'Rolling…' : `Roll ${diceCount > 1 ? diceCount + '× ' : ''}${selectedDie.label}`}
          </Text>
        </AnimatedPressable>
      </View>

      {/* Divider */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.glassBorder }} />
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Coin Flip</Text>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.glassBorder }} />
      </View>

      {/* Coin flip */}
      <View style={{ alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <Animated.View style={coinStyle}>
          <Pressable onPress={flipCoin}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: coinFace === 'heads' ? '#B0853622' : coinFace === 'tails' ? '#5E748B22' : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: 3, borderColor: coinFace ? (coinFace === 'heads' ? '#B08536' : '#5E748B') : colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: coinFace === 'heads' ? '#B08536' : coinFace === 'tails' ? '#5E748B' : colors.textMuted, fontSize: 18, fontWeight: '900' }}>{coinFace === 'heads' ? 'H' : coinFace === 'tails' ? 'T' : '?'}</Text>
            </View>
          </Pressable>
        </Animated.View>
        {coinFace && (
          <Animated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'center' }}>
            <Text style={{ color: coinFace === 'heads' ? '#B08536' : '#5E748B', fontSize: 28, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2 }}>{coinFace}</Text>
          </Animated.View>
        )}
        <AnimatedPressable onPress={flipCoin} scaleValue={0.95} haptic="heavy" style={{ backgroundColor: '#B08536', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 40, shadowColor: '#B08536', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Flip Coin</Text>
        </AnimatedPressable>
      </View>

      {/* History */}
      {history.length > 0 && (
        <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 16 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>RECENT ROLLS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {history.map((h, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: h.color + '15', borderWidth: 1, borderColor: h.color + '33' }}>
                <Text style={{ color: h.color, fontSize: 12, fontWeight: '700' }}>{h.die}</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{h.die === 'Coin' ? (h.result === 1 ? 'H' : 'T') : h.result}</Text>
              </View>
            ))}
          </View>
        </GlassPanel>
      )}

      <EdgeFeaturePanel
        appName="Dice & Coin"
        accent={selectedDie.color}
        headline="Random decisions with a record"
        caption="Use rolls for games, quick choices, transparent draws, or shareable decision logs."
        metrics={[
          { label: 'Die', value: selectedDie.label },
          { label: 'Count', value: `${diceCount}` },
          { label: 'History', value: `${history.length}` },
        ]}
        prompt="Help me turn this random decision into a fair rule or group-friendly explanation."
        shareText={`Dice history: ${history.slice(0, 8).map(h => h.die === 'Coin' ? `Coin ${h.result === 1 ? 'heads' : 'tails'}` : `${h.die}=${h.result}`).join(', ') || 'No rolls yet'}.`}
        publishTitle="Random decision"
        publishBody={`Used Dice & Coin for a transparent random decision. Latest result: ${result ?? (coinFace ?? 'none')}.`}
      />
    </MiniAppShell>
  );
}
