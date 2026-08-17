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
import { useTheme } from '../../src/shared/lib/theme';
import { ttx } from '../../src/shared/lib/i18n';

// Warm editorial palette (lib/avatarPalette.ts) — one hue per die.
function getDice(colors: { danger: string; warning: string; success: string; accent: string; textSecondary: string; textMuted: string }) {
  return [
    { sides: 4,  label: 'D4',  color: colors.danger },
    { sides: 6,  label: 'D6',  color: colors.warning },
    { sides: 8,  label: 'D8',  color: colors.success },
    { sides: 10, label: 'D10', color: colors.accent },
    { sides: 12, label: 'D12', color: colors.textSecondary },
    { sides: 20, label: 'D20', color: colors.textMuted },
  ];
}

type DieItem = ReturnType<typeof getDice>[number];

interface HistoryEntry { die: string; result: number; color: string; ts: number }

function DieFace({ value, sides, color }: { value: number; sides: number; color: string }) {
  const { radius } = useTheme();
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
      <View style={{ width: 100, height: 100, borderRadius: radius.card, backgroundColor: color + '18', borderWidth: 2.5, borderColor: color + '55', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {dots.map(([x, y], i) => (
          <View key={i} style={{ position: 'absolute', left: `${x}%` as any, top: `${y}%` as any, width: 14, height: 14, borderRadius: radius.full, backgroundColor: color, marginLeft: -7, marginTop: -7 }} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ width: 100, height: 100, borderRadius: radius.card, backgroundColor: color + '18', borderWidth: 2.5, borderColor: color + '55', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 36, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1 }}>{value}</Text>
    </View>
  );
}

function ChancePulse({ accent, selectedDie, diceCount, history }: { accent: string; selectedDie: DieItem; diceCount: number; history: HistoryEntry[] }) {
  const { colors, radius } = useTheme();
  const max = selectedDie.sides * diceCount;
  const average = ((selectedDie.sides + 1) / 2) * diceCount;
  const coinFlips = history.filter(item => item.die === 'Coin').length;
  const stats = [
    { label: 'Range', value: `${diceCount}-${max}`, detail: 'possible' },
    { label: 'Average', value: `${average % 1 ? average.toFixed(1) : average}`, detail: 'expected' },
    { label: 'Coin', value: `${coinFlips}`, detail: 'flips' },
  ];
  return (
    <GlassPanel variant="light" borderRadius={radius.card} contentStyle={{ padding: 16, gap: 13 }} style={{ marginBottom: 14, borderColor: `${accent}38` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: radius.lg, backgroundColor: `${accent}20`, alignItems: 'center', justifyContent: 'center' }}>
          <DiceSix color={accent} size={22} weight="duotone" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>{ttx("Chance board")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 }}>{ttx("Rolls, odds, record.")}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.map(stat => (
          <View key={stat.label} style={{ flex: 1, minHeight: 62, borderRadius: radius.lg, padding: 10, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
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
  const { colors, radius } = useTheme();
  const dice = getDice(colors);
  const headsColor = colors.warning;
  const tailsColor = colors.textMuted;
  const [selectedDieIndex, setSelectedDieIndex] = useState(1);
  const selectedDie = dice[selectedDieIndex] ?? dice[1];
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
      setHistory(prev => [{ die: 'Coin', result: face === 'heads' ? 1 : 0, color: headsColor, ts: Date.now() }, ...prev.slice(0, 19)]);
    }, 200);
  };

  const ClearBtn = (
    <AnimatedPressable onPress={() => { setHistory([]); setResult(null); setCoinFace(null); }} scaleValue={0.88} haptic="light">
      <ArrowClockwise color={colors.textMuted} size={20} />
    </AnimatedPressable>
  );

  return (
    <MiniAppShell title={ttx("Dice & Coin")} subtitle={ttx("Chance")} headerRight={ClearBtn}>
      <MiniCommandDeck
        accent={selectedDie.color}
        title={ttx("Fair random decisions")}
        subtitle={ttx("Roll, flip, explain, share.")}
        metrics={[
          { label: 'Die', value: selectedDie.label, detail: `${selectedDie.sides} sides` },
          { label: 'Count', value: `${diceCount}`, detail: 'dice' },
          { label: 'History', value: `${history.length}`, detail: 'logged' },
        ]}
        chips={['Games', 'Draws', 'Group proof']}
      />
      <ChancePulse accent={selectedDie.color} selectedDie={selectedDie} diceCount={diceCount} history={history} />
      {/* Die selector */}
      <GlassPanel variant="medium" borderRadius={radius.card} contentStyle={{ padding: 16 }} style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>{ttx("SELECT DIE")}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {dice.map((d, index) => (
            <Pressable key={d.label} onPress={() => { setSelectedDieIndex(index); setResult(null); }}>
              <View style={{
                paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.md,
                backgroundColor: selectedDieIndex === index ? d.color + '22' : colors.inputBg,
                borderWidth: selectedDieIndex === index ? 2 : StyleSheet.hairlineWidth,
                borderColor: selectedDieIndex === index ? d.color : colors.glassBorder,
              }}>
                <Text style={{ color: selectedDieIndex === index ? d.color : colors.textMuted, fontWeight: '800', fontSize: 15 }}>{d.label}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </GlassPanel>

      {/* Dice count */}
      <GlassPanel variant="medium" borderRadius={radius.card} contentStyle={{ padding: 16 }} style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>{ttx("NUMBER OF DICE")}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <Pressable key={n} onPress={() => { setDiceCount(n); setResult(null); }}>
              <View style={{
                width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
                backgroundColor: diceCount === n ? selectedDie.color + '22' : colors.inputBg,
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
                <View style={{ width: 100, height: 100, borderRadius: radius.card, backgroundColor: selectedDie.color + '18', borderWidth: 2.5, borderColor: selectedDie.color + '55', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <DiceSix color={selectedDie.color} size={44} weight="duotone" />
                  {result !== null && diceCount > 1 && <Text style={{ color: selectedDie.color, fontSize: 18, fontWeight: '900' }}>{result}</Text>}
                </View>
              )}
          </Pressable>
        </Animated.View>

        {result !== null && (
          <Animated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'center' }}>
            <Text style={{ color: selectedDie.color, fontSize: 52, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1.5 }}>{result}</Text>
            {diceCount > 1 && <Text style={{ color: colors.textMuted, fontSize: 14 }}>{diceCount}× {selectedDie.label} {ttx("· total")}</Text>}
          </Animated.View>
        )}

        <AnimatedPressable onPress={rollDie} disabled={rolling} scaleValue={0.95} haptic="heavy" style={{ backgroundColor: selectedDie.color, borderRadius: radius.xl, paddingVertical: 18, paddingHorizontal: 48, shadowColor: selectedDie.color, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, opacity: rolling ? 0.7 : 1 }}>
          <Text style={{ color: colors.bgPure, fontWeight: '900', fontSize: 18, letterSpacing: 0.5 }}>
            {rolling ? 'Rolling…' : `Roll ${diceCount > 1 ? diceCount + '× ' : ''}${selectedDie.label}`}
          </Text>
        </AnimatedPressable>
      </View>

      {/* Divider */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.glassBorder }} />
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{ttx("Coin Flip")}</Text>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.glassBorder }} />
      </View>

      {/* Coin flip */}
      <View style={{ alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <Animated.View style={coinStyle}>
          <Pressable onPress={flipCoin}>
            <View style={{ width: 88, height: 88, borderRadius: radius.full, backgroundColor: coinFace === 'heads' ? `${headsColor}22` : coinFace === 'tails' ? `${tailsColor}22` : colors.inputBg, borderWidth: 3, borderColor: coinFace ? (coinFace === 'heads' ? headsColor : tailsColor) : colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: coinFace === 'heads' ? headsColor : coinFace === 'tails' ? tailsColor : colors.textMuted, fontSize: 18, fontWeight: '900' }}>{coinFace === 'heads' ? 'H' : coinFace === 'tails' ? 'T' : '?'}</Text>
            </View>
          </Pressable>
        </Animated.View>
        {coinFace && (
          <Animated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'center' }}>
            <Text style={{ color: coinFace === 'heads' ? headsColor : tailsColor, fontSize: 28, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2 }}>{coinFace}</Text>
          </Animated.View>
        )}
        <AnimatedPressable onPress={flipCoin} scaleValue={0.95} haptic="heavy" style={{ backgroundColor: headsColor, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 40, shadowColor: headsColor, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
          <Text style={{ color: colors.bgPure, fontWeight: '800', fontSize: 16 }}>{ttx("Flip Coin")}</Text>
        </AnimatedPressable>
      </View>

      {/* History */}
      {history.length > 0 && (
        <GlassPanel variant="light" borderRadius={radius.card} contentStyle={{ padding: 16 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>{ttx("RECENT ROLLS")}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {history.map((h, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: h.color + '15', borderWidth: 1, borderColor: h.color + '33' }}>
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
        headline={ttx("Random decisions with a record")}
        caption={ttx("Use rolls for games, quick choices, transparent draws, or shareable decision logs.")}
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
