import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle,
  withSpring, withSequence, withTiming, runOnJS,
} from 'react-native-reanimated';
import { ArrowLeft, DiceSix, ArrowClockwise } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';

const DICE = [
  { sides: 4,  label: 'D4',  color: '#EF4444', emoji: '🔺' },
  { sides: 6,  label: 'D6',  color: '#F59E0B', emoji: '🎲' },
  { sides: 8,  label: 'D8',  color: '#10B981', emoji: '♦' },
  { sides: 10, label: 'D10', color: '#06B6D4', emoji: '💠' },
  { sides: 12, label: 'D12', color: '#8B5CF6', emoji: '⬡' },
  { sides: 20, label: 'D20', color: '#6366F1', emoji: '⬟' },
];

interface HistoryEntry {
  die: string;
  result: number;
  color: string;
  ts: number;
}

function DieFace({ value, sides, color }: { value: number; sides: number; color: string }) {
  const DOT_MAP: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[25, 50], [75, 50]],
    3: [[25, 50], [50, 50], [75, 50]],
    4: [[25, 35], [75, 35], [25, 65], [75, 65]],
    5: [[25, 35], [75, 35], [50, 50], [25, 65], [75, 65]],
    6: [[25, 30], [75, 30], [25, 50], [75, 50], [25, 70], [75, 70]],
  };
  const dots: [number, number][] = DOT_MAP[value] ?? [];

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
      <Text style={{ color, fontSize: 36, fontWeight: '900', letterSpacing: -1 }}>{value}</Text>
    </View>
  );
}

export default function DiceApp() {
  const { colors } = useTheme();
  const router = useRouter();
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
    setRolling(true);
    setResult(null);

    dieScale.value = withSequence(
      withTiming(0.7, { duration: 80 }),
      withSpring(1.2, { damping: 6 }),
      withSpring(1, { damping: 10 }),
    );
    dieRotate.value = withSequence(
      withTiming(Math.random() > 0.5 ? 20 : -20, { duration: 100 }),
      withTiming(0, { duration: 200 }),
    );

    setTimeout(() => {
      const rolls: number[] = [];
      for (let i = 0; i < diceCount; i++) {
        rolls.push(Math.floor(Math.random() * selectedDie.sides) + 1);
      }
      const total = rolls.reduce((a, b) => a + b, 0);
      setResult(total);
      setRolling(false);
      setHistory(prev => [
        { die: diceCount > 1 ? `${diceCount}×${selectedDie.label}` : selectedDie.label, result: total, color: selectedDie.color, ts: Date.now() },
        ...prev.slice(0, 19),
      ]);
    }, 320);
  }, [rolling, selectedDie, diceCount]);

  const flipCoin = () => {
    coinScale.value = withSequence(
      withTiming(0.5, { duration: 150 }),
      withSpring(1.1, { damping: 6 }),
      withSpring(1),
    );
    setTimeout(() => {
      const face = Math.random() > 0.5 ? 'heads' : 'tails';
      setCoinFace(face);
      setHistory(prev => [
        { die: 'Coin', result: face === 'heads' ? 1 : 0, color: '#F59E0B', ts: Date.now() },
        ...prev.slice(0, 19),
      ]);
    }, 200);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <AnimatedPressable onPress={() => router.back()} scaleValue={0.88} haptic="light" style={{ marginRight: 12 }}>
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Dice & Coin</Text>
        <AnimatedPressable
          onPress={() => { setHistory([]); setResult(null); setCoinFace(null); }}
          scaleValue={0.88} haptic="light"
        >
          <ArrowClockwise color={colors.textMuted} size={20} />
        </AnimatedPressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Die selector */}
        <Animated.View entering={FadeInDown.delay(40).springify()}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>SELECT DIE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {DICE.map(d => (
              <Pressable key={d.label} onPress={() => { setSelectedDie(d); setResult(null); }}>
                <View style={{
                  paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14,
                  backgroundColor: selectedDie.label === d.label ? d.color + '22' : colors.surface,
                  borderWidth: 2, borderColor: selectedDie.label === d.label ? d.color : colors.border,
                }}>
                  <Text style={{ color: selectedDie.label === d.label ? d.color : colors.textMuted, fontWeight: '800', fontSize: 15 }}>
                    {d.label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Dice count */}
        <Animated.View entering={FadeInDown.delay(80).springify()}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>NUMBER OF DICE</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[1, 2, 3, 4, 5, 6].map(n => (
              <Pressable key={n} onPress={() => { setDiceCount(n); setResult(null); }}>
                <View style={{
                  width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: diceCount === n ? selectedDie.color + '22' : colors.surface,
                  borderWidth: 2, borderColor: diceCount === n ? selectedDie.color : colors.border,
                }}>
                  <Text style={{ color: diceCount === n ? selectedDie.color : colors.textMuted, fontWeight: '800', fontSize: 16 }}>{n}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Roll area */}
        <Animated.View entering={FadeInDown.delay(120).springify()} style={{ alignItems: 'center', gap: 20 }}>
          <Animated.View style={dieStyle}>
            <Pressable onPress={rollDie}>
              {result !== null && diceCount === 1
                ? <DieFace value={result} sides={selectedDie.sides} color={selectedDie.color} />
                : (
                  <View style={{ width: 100, height: 100, borderRadius: 22, backgroundColor: selectedDie.color + '18', borderWidth: 2.5, borderColor: selectedDie.color + '55', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <DiceSix color={selectedDie.color} size={44} weight="duotone" />
                    {result !== null && diceCount > 1 && (
                      <Text style={{ color: selectedDie.color, fontSize: 18, fontWeight: '900' }}>{result}</Text>
                    )}
                  </View>
                )}
            </Pressable>
          </Animated.View>

          {result !== null && (
            <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center' }}>
              <Text style={{ color: selectedDie.color, fontSize: 52, fontWeight: '900', letterSpacing: -2 }}>{result}</Text>
              {diceCount > 1 && (
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>{diceCount}× {selectedDie.label} · total</Text>
              )}
            </Animated.View>
          )}

          <AnimatedPressable
            onPress={rollDie}
            disabled={rolling}
            scaleValue={0.95} haptic="heavy"
            style={{
              backgroundColor: selectedDie.color, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 48,
              shadowColor: selectedDie.color, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
              opacity: rolling ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 0.5 }}>
              {rolling ? 'Rolling…' : `Roll ${diceCount > 1 ? diceCount + '× ' : ''}${selectedDie.label}`}
            </Text>
          </AnimatedPressable>
        </Animated.View>

        {/* Divider */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Coin Flip</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        {/* Coin flip */}
        <Animated.View entering={FadeInDown.delay(160).springify()} style={{ alignItems: 'center', gap: 16 }}>
          <Animated.View style={coinStyle}>
            <Pressable onPress={flipCoin}>
              <View style={{
                width: 88, height: 88, borderRadius: 44,
                backgroundColor: coinFace === 'heads' ? '#F59E0B22' : coinFace === 'tails' ? '#6366F122' : colors.surface,
                borderWidth: 3, borderColor: coinFace ? (coinFace === 'heads' ? '#F59E0B' : '#6366F1') : colors.border,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 40 }}>
                  {coinFace === 'heads' ? '👑' : coinFace === 'tails' ? '⭐' : '🪙'}
                </Text>
              </View>
            </Pressable>
          </Animated.View>

          {coinFace && (
            <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center' }}>
              <Text style={{ color: coinFace === 'heads' ? '#F59E0B' : '#6366F1', fontSize: 28, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2 }}>
                {coinFace}
              </Text>
            </Animated.View>
          )}

          <AnimatedPressable onPress={flipCoin} scaleValue={0.95} haptic="heavy" style={{
            backgroundColor: '#F59E0B', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 40,
            shadowColor: '#F59E0B', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
          }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Flip Coin</Text>
          </AnimatedPressable>
        </Animated.View>

        {/* Roll history */}
        {history.length > 0 && (
          <Animated.View entering={FadeInDown.springify()}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>RECENT ROLLS</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {history.map((h, i) => (
                <View key={i} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                  backgroundColor: h.color + '15', borderWidth: 1, borderColor: h.color + '33',
                }}>
                  <Text style={{ color: h.color, fontSize: 12, fontWeight: '700' }}>{h.die}</Text>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>
                    {h.die === 'Coin' ? (h.result === 1 ? 'H' : 'T') : h.result}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
