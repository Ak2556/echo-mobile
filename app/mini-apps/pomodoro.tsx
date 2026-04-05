import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Play, Pause, ArrowCounterClockwise } from 'phosphor-react-native';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { useTheme } from '../../lib/theme';

type Mode = 'focus' | 'short' | 'long';

const MODES = [
  { id: 'focus' as Mode, label: 'Focus', emoji: '🎯', minutes: 25, color: '#EF4444' },
  { id: 'short' as Mode, label: 'Short Break', emoji: '☕', minutes: 5, color: '#10B981' },
  { id: 'long' as Mode, label: 'Long Break', emoji: '🌿', minutes: 15, color: '#3B82F6' },
];

const { width } = Dimensions.get('window');
const RING = Math.min(width - 80, 260);

export default function PomodoroScreen() {
  const { colors } = useTheme();

  const [mode, setMode] = useState<Mode>('focus');
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const modeData = MODES.find(m => m.id === mode)!;
  const totalSecs = modeData.minutes * 60;
  const accent = modeData.color;
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(seconds / totalSecs, { duration: 600, easing: Easing.out(Easing.ease) });
  }, [seconds, totalSecs, progress]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            setCycles(c => c + (mode === 'focus' ? 1 : 0));
            setLog(l => [`✅ ${modeData.label} — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, ...l].slice(0, 12));
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode, modeData.label]);

  const switchMode = (m: Mode) => {
    setRunning(false);
    setMode(m);
    setSeconds(MODES.find(x => x.id === m)!.minutes * 60);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const reset = () => {
    setRunning(false);
    setSeconds(totalSecs);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  const pct = Math.round(((totalSecs - seconds) / totalSecs) * 100);

  const CycleCounter = (
    <View style={{ backgroundColor: accent + '22', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: accent + '44' }}>
      <Text style={{ color: accent, fontWeight: '800', fontSize: 20, lineHeight: 24 }}>{cycles}</Text>
      <Text style={{ color: accent, fontSize: 10, fontWeight: '600', opacity: 0.8 }}>cycles</Text>
    </View>
  );

  return (
    <MiniAppShell title="Pomodoro" subtitle="Stay in the zone" headerRight={CycleCounter}>
      {/* Mode tabs */}
      <GlassPanel variant="light" borderRadius={16} style={{ marginBottom: 28 }} contentStyle={{ flexDirection: 'row', padding: 4, gap: 4 }}>
        {MODES.map(m => (
          <Pressable
            key={m.id}
            onPress={() => switchMode(m.id)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: mode === m.id ? m.color : 'transparent' }}
          >
            <Text style={{ fontSize: 14 }}>{m.emoji}</Text>
            <Text style={{ color: mode === m.id ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 11, marginTop: 2 }}>{m.label.split(' ')[0]}</Text>
          </Pressable>
        ))}
      </GlassPanel>

      {/* Ring */}
      <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center', marginBottom: 32, alignSelf: 'center' }}>
        <View style={{ position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 16, borderColor: accent + '18' }} />
        <View style={{ position: 'absolute', width: RING - 16, height: RING - 16, borderRadius: (RING - 16) / 2, borderWidth: 4, borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />
        <View style={{ position: 'absolute', width: RING - 16, height: RING - 16, borderRadius: (RING - 16) / 2, borderWidth: 4, borderColor: accent, borderRightColor: 'transparent', borderBottomColor: pct > 25 ? accent : 'transparent', borderLeftColor: pct > 50 ? accent : 'transparent', borderTopColor: pct > 75 ? 'transparent' : accent }} />
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: RING * 0.26, fontWeight: '200', letterSpacing: -4, lineHeight: RING * 0.28 }}>
            {mins}:{secs}
          </Text>
          <View style={{ paddingHorizontal: 14, paddingVertical: 5, backgroundColor: accent + '22', borderRadius: 20, borderWidth: 1, borderColor: accent + '44', marginTop: 8 }}>
            <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>
              {running ? `${pct}% done` : pct === 0 ? modeData.emoji + ' Ready' : `${pct}% done`}
            </Text>
          </View>
        </View>
      </View>

      {/* Controls */}
      <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
        <Pressable
          onPress={reset}
          style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
          }}
        >
          <ArrowCounterClockwise color={colors.textMuted} size={22} weight="bold" />
        </Pressable>
        <Pressable
          onPress={() => setRunning(r => !r)}
          style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', shadowColor: accent, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 6 } }}
        >
          {running ? <Pause color="#fff" size={34} weight="fill" /> : <Play color="#fff" size={34} weight="fill" />}
        </Pressable>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
          <Text style={{ fontSize: 24 }}>{MODES.find(m => m.id !== mode)?.emoji ?? '⏭️'}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
        {[
          { label: 'Session', value: modeData.minutes + 'm' },
          { label: 'Remaining', value: `${mins}m ${secs}s` },
          { label: 'Today', value: `${cycles} 🍅` },
        ].map(s => (
          <GlassPanel key={s.label} variant="light" borderRadius={16} style={{ flex: 1 }} contentStyle={{ padding: 14, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{s.value}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{s.label}</Text>
          </GlassPanel>
        ))}
      </View>

      {/* Log */}
      {log.length > 0 && (
        <GlassPanel variant="light" borderRadius={20} contentStyle={{ overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>SESSION LOG</Text>
          </View>
          {log.map((entry, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: i < log.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.glassBorder }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>{entry}</Text>
            </View>
          ))}
        </GlassPanel>
      )}
    </MiniAppShell>
  );
}
