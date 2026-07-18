import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { type AudioPlayer } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { AppState, View, Text, TextInput, Pressable, StyleSheet, Modal, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Pause, ArrowCounterClockwise, GearSix, Fire, Minus, Plus, X, Lightning, Flag, Timer, TreeEvergreen, MusicNote, SpeakerHigh, SpeakerSlash } from 'phosphor-react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';
import { showToast } from '../../components/ui/Toast';
import { createFocusBeatPlayer, FOCUS_BEATS, type FocusBeatId } from '../../lib/focusBeats';
import { schedulePomodoroTimerNotification } from '../../lib/pomodoroRuntime';
import {
  ActivePomodoroTimer, PomodoroDoc, PomodoroMode, PomodoroSettings, DEFAULT_POMODORO_SETTINGS,
  clearActivePomodoroTimer, goalStreak, loadActivePomodoroTimer, loadPomodoro,
  remainingSecondsForActive, saveActivePomodoroTimer, savePomodoro,
  sessionsOn, todayStats, topLabels, weekBars,
} from '../../lib/pomodoro';

type Mode = PomodoroMode;

const MODE_META: Record<Mode, { label: string; marker: string; color: string }> = {
  focus: { label: 'Focus', marker: 'FO', color: '#C65F3F' },
  short: { label: 'Short Break', marker: 'SB', color: '#4E8B7A' },
  long: { label: 'Long Break', marker: 'LB', color: '#4E7A8B' },
};

function timerColor(mode: Mode, remainingRatio: number): string {
  const clamped = Math.max(0, Math.min(1, remainingRatio));
  if (mode !== 'focus') {
    if (clamped > 0.66) return '#4E8B7A';
    if (clamped > 0.33) return '#4E7A8B';
    return '#5E748B';
  }
  if (clamped > 0.66) return '#4E8B7A';
  if (clamped > 0.33) return '#C6A34A';
  if (clamped > 0.15) return '#D97745';
  return '#E84848';
}

function timerPhase(mode: Mode, remainingRatio: number): string {
  if (mode !== 'focus') return remainingRatio > 0.33 ? 'Recover' : 'Return soon';
  if (remainingRatio > 0.66) return 'Settle in';
  if (remainingRatio > 0.33) return 'Deep work';
  if (remainingRatio > 0.15) return 'Final push';
  return 'Finish strong';
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const FOCUS_PRESETS = [15, 25, 50] as const;

function presetName(minutes: number): string {
  if (minutes <= 15) return 'Sprint';
  if (minutes >= 50) return 'Deep';
  return 'Classic';
}

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function nextModeLabel(mode: Mode, doneToday: number, settings: PomodoroSettings): string {
  if (mode !== 'focus') return 'Focus';
  return doneToday > 0 && doneToday % settings.longEvery === 0 ? 'Long break' : 'Short break';
}

function Stepper({ label, value, unit, min, max, step = 1, onChange, accent }: {
  label: string; value: number; unit: string; min: number; max: number; step?: number;
  onChange: (v: number) => void; accent: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
      <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600', flex: 1 }}>{label}</Text>
      <AnimatedPressable onPress={() => onChange(Math.max(min, value - step))} scaleValue={0.85} haptic="light" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 10, padding: 8 }}>
        <Minus color={colors.text} size={13} weight="bold" />
      </AnimatedPressable>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {value} {unit}
      </Text>
      <AnimatedPressable onPress={() => onChange(Math.min(max, value + step))} scaleValue={0.85} haptic="light" style={{ backgroundColor: accent, borderRadius: 10, padding: 8 }}>
        <Plus color="#fff" size={13} weight="bold" />
      </AnimatedPressable>
    </View>
  );
}

function SettingsSheet({ settings, onSave, onClose }: {
  settings: PomodoroSettings;
  onSave: (s: PomodoroSettings) => void;
  onClose: () => void;
}) {
  const { colors, switchTrack } = useTheme();
  const insets = useSafeAreaInsets();
  const [s, setS] = useState(settings);
  const accent = MODE_META.focus.color;

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>Timer Settings</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light"><X color={colors.textMuted} size={22} /></AnimatedPressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 4, paddingBottom: 40 }}>
          <Stepper label="Focus length" value={s.focusMin} unit="min" min={5} max={120} step={5} accent={accent} onChange={v => setS({ ...s, focusMin: v })} />
          <Stepper label="Short break" value={s.shortMin} unit="min" min={1} max={30} accent={accent} onChange={v => setS({ ...s, shortMin: v })} />
          <Stepper label="Long break" value={s.longMin} unit="min" min={5} max={60} step={5} accent={accent} onChange={v => setS({ ...s, longMin: v })} />
          <Stepper label="Long break every" value={s.longEvery} unit="sessions" min={2} max={8} accent={accent} onChange={v => setS({ ...s, longEvery: v })} />
          <Stepper label="Daily goal" value={s.dailyGoal} unit="sessions" min={1} max={20} accent={accent} onChange={v => setS({ ...s, dailyGoal: v })} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>Auto-start breaks</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Break timer starts the moment focus ends</Text>
            </View>
            <Switch value={s.autoStartBreaks} onValueChange={v => setS({ ...s, autoStartBreaks: v })} trackColor={switchTrack} />
          </View>
          <AnimatedPressable
            onPress={() => { onSave(s); onClose(); }}
            scaleValue={0.96} haptic="medium"
            style={{ backgroundColor: accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Save Settings</Text>
          </AnimatedPressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function StageRail({ mode, elapsedRatio, accent }: { mode: Mode; elapsedRatio: number; accent: string }) {
  const { colors } = useTheme();
  const stages = mode === 'focus'
    ? ['Settle', 'Build', 'Push', 'Ship']
    : mode === 'short'
      ? ['Breathe', 'Reset', 'Return']
      : ['Recover', 'Reflect', 'Return'];
  const activeIndex = Math.min(stages.length - 1, Math.floor(Math.max(0, Math.min(0.999, elapsedRatio)) * stages.length));
  return (
    <View style={{ flexDirection: 'row', gap: 7, marginBottom: 16 }}>
      {stages.map((stage, index) => {
        const active = index <= activeIndex;
        return (
          <View
            key={stage}
            style={{
              flex: 1,
              minHeight: 34,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? `${accent}22` : colors.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: active ? `${accent}66` : colors.glassBorder,
            }}
          >
            <Text style={{ color: active ? accent : colors.textMuted, fontSize: 11, fontWeight: '900' }} numberOfLines={1}>
              {stage}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function TimerInsightStrip({
  mode,
  running,
  label,
  endAt,
  nextLabel,
  todayCount,
  dailyGoal,
  accent,
}: {
  mode: Mode;
  running: boolean;
  label: string;
  endAt: string;
  nextLabel: string;
  todayCount: number;
  dailyGoal: number;
  accent: string;
}) {
  const { colors } = useTheme();
  const chips = [
    { key: 'finish', icon: <Flag color={accent} size={14} weight="fill" />, label: running ? `Ends ${endAt}` : 'Ready' },
    { key: 'next', icon: <Timer color={accent} size={14} weight="bold" />, label: `Next ${nextLabel}` },
    { key: 'goal', icon: <Lightning color={accent} size={14} weight="fill" />, label: `${todayCount}/${dailyGoal} today` },
  ];
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', gap: 7, marginBottom: label.trim() ? 9 : 0 }}>
        {chips.map(chip => (
          <View
            key={chip.key}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: 14,
              paddingHorizontal: 8,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 5,
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.035)',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
            }}
          >
            {chip.icon}
            <Text style={{ color: colors.textSecondary, fontSize: 10.8, fontWeight: '800', flexShrink: 1 }} numberOfLines={1}>
              {chip.label}
            </Text>
          </View>
        ))}
      </View>
      {label.trim() ? (
        <View style={{ borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: `${accent}14`, borderWidth: StyleSheet.hairlineWidth, borderColor: `${accent}44` }}>
          <Text style={{ color: accent, fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 2 }}>
            {mode === 'focus' ? 'Current focus' : 'Break context'}
          </Text>
          <Text style={{ color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' }} numberOfLines={2}>
            {label.trim()}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function FocusPresetRail({
  activeMinutes,
  running,
  accent,
  onSelect,
}: {
  activeMinutes: number;
  running: boolean;
  accent: string;
  onSelect: (minutes: number) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 9 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', flex: 1 }}>
          Start style
        </Text>
        <Text style={{ color: running ? accent : colors.textMuted, fontSize: 11, fontWeight: '800' }}>
          {running ? 'Locked in' : `${activeMinutes}m selected`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {FOCUS_PRESETS.map(minutes => {
          const selected = activeMinutes === minutes;
          return (
            <AnimatedPressable
              key={minutes}
              onPress={() => onSelect(minutes)}
              disabled={running}
              scaleValue={running ? 1 : 0.95}
              haptic="light"
              style={{
                flex: 1,
                minHeight: 58,
                borderRadius: 17,
                paddingHorizontal: 10,
                justifyContent: 'center',
                backgroundColor: selected ? accent : (colors.isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.035)'),
                borderWidth: 1,
                borderColor: selected ? `${accent}AA` : colors.glassBorder,
                opacity: running && !selected ? 0.45 : 1,
              }}
            >
              <Text style={{ color: selected ? '#fff' : colors.text, fontSize: 15, fontWeight: '900', textAlign: 'center' }}>{minutes}m</Text>
              <Text style={{ color: selected ? 'rgba(255,255,255,0.76)' : colors.textMuted, fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 2 }}>
                {presetName(minutes)}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

function FocusIntelligencePanel({
  accent,
  stats,
  streak,
  activeMinutes,
  nextLabel,
  strongestLabel,
}: {
  accent: string;
  stats: ReturnType<typeof todayStats>;
  streak: number;
  activeMinutes: number;
  nextLabel: string;
  strongestLabel?: string;
}) {
  const { colors } = useTheme();
  const goalRatio = Math.min(1, stats.count / Math.max(stats.goal, 1));
  const tiles = [
    { label: 'Pace', value: `${Math.round(goalRatio * 100)}%`, detail: 'goal' },
    { label: 'Next', value: nextLabel, detail: 'auto' },
    { label: 'Streak', value: `${streak}d`, detail: 'proof' },
  ];
  return (
    <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 16, gap: 14 }} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: `${accent}20`, alignItems: 'center', justifyContent: 'center' }}>
          <Lightning color={accent} size={20} weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>Focus intelligence</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
            {strongestLabel ? `Best lane: ${strongestLabel}` : `${activeMinutes}m block ready`}
          </Text>
        </View>
      </View>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <View style={{ width: `${goalRatio * 100}%`, height: '100%', borderRadius: 999, backgroundColor: accent }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {tiles.map(tile => (
          <View key={tile.label} style={{ flex: 1, minHeight: 58, borderRadius: 16, padding: 10, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 }}>{tile.label}</Text>
            <Text style={{ color: colors.text, fontSize: tile.value.length > 6 ? 13 : 16, fontWeight: '900', marginTop: 5 }} numberOfLines={1}>{tile.value}</Text>
            <Text style={{ color: accent, fontSize: 10.5, fontWeight: '800', marginTop: 1 }}>{tile.detail}</Text>
          </View>
        ))}
      </View>
    </GlassPanel>
  );
}

function FocusGarden({
  accent,
  stats,
  streak,
  elapsedRatio,
  running,
}: {
  accent: string;
  stats: ReturnType<typeof todayStats>;
  streak: number;
  elapsedRatio: number;
  running: boolean;
}) {
  const { colors } = useTheme();
  const growth = Math.min(1, (stats.count + (running ? elapsedRatio : 0)) / Math.max(stats.goal, 1));
  const leafCount = Math.min(10, Math.max(2, Math.floor(growth * 8) + Math.min(2, streak)));
  const stage = growth >= 1 ? 'Forest' : growth > 0.62 ? 'Tree' : growth > 0.28 ? 'Sprout' : 'Seed';
  const forestCount = Math.max(0, Math.floor(stats.count / Math.max(stats.goal, 1)));
  const milestones = [
    { label: 'Seed', at: 0 },
    { label: 'Sprout', at: 0.28 },
    { label: 'Tree', at: 0.62 },
    { label: 'Forest', at: 1 },
  ];
  const leaves = Array.from({ length: 10 }, (_, index) => index);

  return (
    <GlassPanel variant="light" borderRadius={24} contentStyle={{ padding: 18 }} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            position: 'absolute',
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: `${accent}12`,
            borderWidth: 1,
            borderColor: `${accent}2E`,
          }} />
          {leaves.map(index => {
            const active = index < leafCount;
            const angle = (index / leaves.length) * Math.PI * 2 - Math.PI / 2;
            const distance = 34 + (index % 2) * 9;
            return (
              <View
                key={index}
                style={{
                  position: 'absolute',
                  left: 56 + Math.cos(angle) * distance - 5,
                  top: 56 + Math.sin(angle) * distance - 5,
                  width: active ? 10 : 6,
                  height: active ? 10 : 6,
                  borderRadius: 999,
                  backgroundColor: active ? accent : colors.glassBorder,
                  opacity: active ? 0.95 : 0.38,
                }}
              />
            );
          })}
          <View style={{
            width: 62 + growth * 20,
            height: 62 + growth * 20,
            borderRadius: 26,
            backgroundColor: `${accent}${running ? '22' : '18'}`,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <TreeEvergreen color={accent} size={34 + growth * 16} weight={growth > 0.55 ? 'fill' : 'duotone'} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900', flex: 1 }}>Focus tree</Text>
            <Text style={{ color: accent, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' }}>
              {forestCount > 0 ? `Forest ${forestCount}` : stage}
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '600' }}>
            Seed to forest. One focus block at a time.
          </Text>
          <View style={{ height: 9, borderRadius: 999, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', overflow: 'hidden', marginTop: 14 }}>
            <View style={{ width: `${growth * 100}%`, height: '100%', borderRadius: 999, backgroundColor: accent }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 5, marginTop: 10 }}>
            {milestones.map(milestone => {
              const active = growth >= milestone.at;
              return (
                <View
                  key={milestone.label}
                  style={{
                    flex: 1,
                    minHeight: 24,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? `${accent}24` : colors.surface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: active ? `${accent}55` : colors.glassBorder,
                  }}
                >
                  <Text style={{ color: active ? accent : colors.textMuted, fontSize: 9.5, fontWeight: '900' }} numberOfLines={1}>
                    {milestone.label}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1, borderRadius: 14, padding: 10, backgroundColor: colors.surface }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900' }}>{stats.count}/{stats.goal}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800' }}>today</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 14, padding: 10, backgroundColor: colors.surface }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900' }}>{streak}d</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800' }}>streak</Text>
            </View>
          </View>
        </View>
      </View>
    </GlassPanel>
  );
}

function FocusBeatsPanel({
  accent,
  playingBeat,
  onToggle,
}: {
  accent: string;
  playingBeat: FocusBeatId | null;
  onToggle: (beat: FocusBeatId) => void;
}) {
  const { colors } = useTheme();
  return (
    <GlassPanel variant="light" borderRadius={22} contentStyle={{ padding: 16, gap: 13 }} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: `${accent}20`, alignItems: 'center', justifyContent: 'center' }}>
          {playingBeat ? <SpeakerHigh color={accent} size={19} weight="fill" /> : <MusicNote color={accent} size={19} weight="bold" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>Focus beats</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 }}>
            {playingBeat ? `${FOCUS_BEATS[playingBeat].name} playing` : 'Relax while focusing'}
          </Text>
        </View>
        {playingBeat ? <SpeakerSlash color={colors.textMuted} size={19} weight="bold" /> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(FOCUS_BEATS) as FocusBeatId[]).map(beat => {
          const selected = playingBeat === beat;
          const item = FOCUS_BEATS[beat];
          return (
            <AnimatedPressable
              key={beat}
              onPress={() => onToggle(beat)}
              scaleValue={0.95}
              haptic="light"
              style={{
                width: '48.5%',
                minHeight: 62,
                borderRadius: 17,
                paddingHorizontal: 13,
                justifyContent: 'center',
                backgroundColor: selected ? accent : colors.surface,
                borderWidth: 1,
                borderColor: selected ? `${accent}AA` : colors.glassBorder,
              }}
            >
              <Text style={{ color: selected ? '#fff' : colors.text, fontSize: 14.5, fontWeight: '900' }}>{item.name}</Text>
              <Text style={{ color: selected ? 'rgba(255,255,255,0.76)' : colors.textMuted, fontSize: 11.5, fontWeight: '700', marginTop: 3 }}>{item.detail}</Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </GlassPanel>
  );
}

function FocusMomentumStrip({
  accent,
  pct,
  phase,
  stats,
  elapsedMinutes,
  running,
}: {
  accent: string;
  pct: number;
  phase: string;
  stats: ReturnType<typeof todayStats>;
  elapsedMinutes: number;
  running: boolean;
}) {
  const { colors } = useTheme();
  const liveMinutes = stats.minutes + elapsedMinutes;
  const rank = liveMinutes >= 180 ? 'Elite' : liveMinutes >= 120 ? 'Deep' : liveMinutes >= 60 ? 'Sharp' : liveMinutes >= 25 ? 'Warm' : 'Start';
  const nextSession = Math.max(0, stats.goal - stats.count);
  const chips = [
    { label: 'Flow', value: `${pct}%`, detail: running ? phase : 'ready' },
    { label: 'Rank', value: rank, detail: `${liveMinutes}m` },
    { label: 'Next', value: nextSession <= 1 ? 'Win' : `${nextSession} left`, detail: 'goal' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
      {chips.map(chip => (
        <View
          key={chip.label}
          style={{
            flex: 1,
            minHeight: 58,
            borderRadius: 17,
            paddingHorizontal: 10,
            paddingVertical: 9,
            backgroundColor: colors.isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.035)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: chip.label === 'Flow' ? `${accent}55` : colors.glassBorder,
          }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 }}>{chip.label}</Text>
          <Text style={{ color: chip.label === 'Flow' ? accent : colors.text, fontSize: 15, fontWeight: '900', marginTop: 5 }} numberOfLines={1}>{chip.value}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>{chip.detail}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PomodoroScreen() {
  const { colors } = useTheme();
  const layout = useResponsiveLayout();

  const [doc, setDoc] = useState<PomodoroDoc>({ sessions: [], settings: DEFAULT_POMODORO_SETTINGS });
  const [mode, setMode] = useState<Mode>('focus');
  const [seconds, setSeconds] = useState(DEFAULT_POMODORO_SETTINGS.focusMin * 60);
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [draftTotalSecs, setDraftTotalSecs] = useState<number | null>(null);
  const [playingBeat, setPlayingBeat] = useState<FocusBeatId | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef<ActivePomodoroTimer | null>(null);
  const beatPlayerRef = useRef<AudioPlayer | null>(null);
  const finishingRef = useRef(false);
  const notifIdRef = useRef<string | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const minutesFor = useCallback((m: Mode, s: PomodoroSettings = docRef.current.settings) =>
    m === 'focus' ? s.focusMin : m === 'short' ? s.shortMin : s.longMin, []);

  const activeTotalSecs = activeRef.current?.mode === mode ? activeRef.current.totalSeconds : undefined;
  const configuredTotalSecs = minutesFor(mode) * 60;
  const totalSecs = activeTotalSecs ?? (mode === 'focus' && draftTotalSecs ? draftTotalSecs : configuredTotalSecs);
  const remainingRatio = seconds / Math.max(totalSecs, 1);
  const elapsedRatio = totalSecs > 0 ? Math.max(0, Math.min(1, (totalSecs - seconds) / totalSecs)) : 0;
  const accent = timerColor(mode, remainingRatio);
  const endAtLabel = useMemo(() => {
    const activeEnd = activeRef.current?.endAt;
    if (running && activeEnd) return formatClockTime(new Date(activeEnd));
    return formatClockTime(new Date(Date.now() + seconds * 1000));
  }, [running, seconds]);
  const progress = useSharedValue(1);
  const pulse = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(
      seconds / Math.max(totalSecs, 1),
      { duration: running ? 1000 : 260, easing: running ? Easing.linear : Easing.out(Easing.ease) },
    );
  }, [running, seconds, totalSecs, progress]);

  useEffect(() => {
    if (running) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.035, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      cancelAnimation(glow);
      pulse.value = withTiming(1, { duration: 220 });
      glow.value = withTiming(0, { duration: 220 });
    }
  }, [glow, pulse, running]);

  const stats = todayStats(doc);
  const streak = goalStreak(doc);
  const bars = weekBars(doc);
  const maxBar = Math.max(1, ...bars.map(b => b.count), doc.settings.dailyGoal);
  const quickLabels = topLabels(doc);
  const todaySessions = sessionsOn(doc.sessions, new Date().toISOString().slice(0, 10));
  const nextLabel = nextModeLabel(mode, mode === 'focus' ? stats.count + 1 : stats.count, doc.settings);

  const update = (next: PomodoroDoc) => { setDoc(next); void savePomodoro(next); };

  const cancelTimerNotification = useCallback((notificationId?: string | null) => {
    const id = notificationId ?? notifIdRef.current;
    if (id) void Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    if (!notificationId || notificationId === notifIdRef.current) notifIdRef.current = null;
  }, []);

  const beginActiveTimer = useCallback(async (
    nextMode: Mode,
    durationSeconds: number,
    nextLabel: string,
    originalTotalSeconds = durationSeconds,
    force = false,
  ) => {
    if ((!force && running) || durationSeconds <= 0) return;
    const now = Date.now();
    const active: ActivePomodoroTimer = {
      mode: nextMode,
      label: nextLabel,
      startedAt: new Date(now).toISOString(),
      endAt: new Date(now + durationSeconds * 1000).toISOString(),
      totalSeconds: originalTotalSeconds,
      notificationId: null,
    };
    const notificationId = await schedulePomodoroTimerNotification(nextMode, durationSeconds);
    const nextActive = { ...active, notificationId };
    activeRef.current = nextActive;
    notifIdRef.current = notificationId;
    await saveActivePomodoroTimer(nextActive);
    setMode(nextMode);
    setSeconds(durationSeconds);
    setRunning(true);
  }, [running]);

  const stopActiveTimer = useCallback(() => {
    const active = activeRef.current;
    setRunning(false);
    activeRef.current = null;
    cancelTimerNotification(active?.notificationId);
    void clearActivePomodoroTimer();
  }, [cancelTimerNotification]);

  const completeTimer = useCallback(async (completedTimer?: ActivePomodoroTimer | null) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      const completedMode = completedTimer?.mode ?? mode;
      const completedLabel = completedTimer?.label ?? label;
      const notificationId = completedTimer?.notificationId ?? activeRef.current?.notificationId;
      const completedTotalSeconds = completedTimer?.totalSeconds ?? activeRef.current?.totalSeconds ?? docRef.current.settings.focusMin * 60;
      setRunning(false);
      activeRef.current = null;
      setDraftTotalSecs(null);
      cancelTimerNotification(notificationId);
      await clearActivePomodoroTimer();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (completedMode === 'focus') {
        const d = docRef.current;
        const completedMinutes = Math.max(1, Math.round(completedTotalSeconds / 60));
        const next: PomodoroDoc = {
          ...d,
          sessions: [
            { id: Date.now().toString(), label: completedLabel.trim(), minutes: completedMinutes, at: new Date().toISOString() },
            ...d.sessions,
          ],
        };
        update(next);
        const doneToday = sessionsOn(next.sessions, new Date().toISOString().slice(0, 10)).length;
        if (doneToday === next.settings.dailyGoal) showToast(`🎯 Daily goal hit — ${doneToday} sessions`, 'Goal');
        const nextMode: Mode = doneToday % next.settings.longEvery === 0 ? 'long' : 'short';
        const nextSeconds = minutesFor(nextMode, next.settings) * 60;
        if (next.settings.autoStartBreaks) {
          const endedAt = completedTimer?.endAt ? Date.parse(completedTimer.endAt) : Date.now();
          const breakElapsed = Number.isFinite(endedAt) ? Math.floor((Date.now() - endedAt) / 1000) : 0;
          const breakRemaining = Math.max(0, nextSeconds - Math.max(0, breakElapsed));
          if (breakRemaining > 0) {
            await beginActiveTimer(nextMode, breakRemaining, completedLabel, nextSeconds, true);
          } else {
            setMode('focus');
            setSeconds(minutesFor('focus', next.settings) * 60);
          }
        } else {
          setMode(nextMode);
          setSeconds(nextSeconds);
        }
      } else {
        setMode('focus');
        setSeconds(minutesFor('focus') * 60);
      }
    } finally {
      finishingRef.current = false;
    }
  }, [beginActiveTimer, cancelTimerNotification, label, minutesFor, mode]);

  const restoreActiveTimer = useCallback(async () => {
    const active = await loadActivePomodoroTimer();
    if (!active) return false;
    const remaining = remainingSecondsForActive(active);
    activeRef.current = active;
    notifIdRef.current = active.notificationId ?? null;
    setMode(active.mode);
    setLabel(active.label);
    setDraftTotalSecs(null);
    setSeconds(remaining);
    if (remaining <= 0) {
      await completeTimer(active);
      return true;
    }
    setRunning(true);
    if (!active.notificationId) {
      const notificationId = await schedulePomodoroTimerNotification(active.mode, remaining);
      const nextActive = { ...active, notificationId };
      activeRef.current = nextActive;
      notifIdRef.current = notificationId;
      await saveActivePomodoroTimer(nextActive);
    }
    return true;
  }, [completeTimer]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadPomodoro();
      if (cancelled) return;
      docRef.current = loaded;
      setDoc(loaded);
      const restored = await restoreActiveTimer();
      if (!cancelled && !restored) {
        setDraftTotalSecs(null);
        setSeconds(loaded.settings.focusMin * 60);
      }
    })();
    return () => { cancelled = true; };
    // Hydrate once on screen entry; foreground reconciliation is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return undefined;
    }
    const tick = () => {
      const active = activeRef.current;
      if (!active) {
        setRunning(false);
        return;
      }
      const remaining = remainingSecondsForActive(active);
      setSeconds(remaining);
      if (remaining <= 0) void completeTimer(active);
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, completeTimer]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void restoreActiveTimer();
        return;
      }
      if (activeRef.current) void saveActivePomodoroTimer(activeRef.current);
    });
    return () => sub.remove();
  }, [restoreActiveTimer]);

  useEffect(() => {
    const active = activeRef.current;
    if (!running || !active || active.label === label) return;
    const nextActive = { ...active, label };
    activeRef.current = nextActive;
    void saveActivePomodoroTimer(nextActive);
  }, [label, running]);

  const startTimer = useCallback(() => {
    void beginActiveTimer(mode, seconds, label, totalSecs);
  }, [beginActiveTimer, label, mode, seconds, totalSecs]);

  const switchMode = (m: Mode) => {
    stopActiveTimer();
    setDraftTotalSecs(null);
    setMode(m);
    setSeconds(minutesFor(m) * 60);
  };

  const reset = () => {
    stopActiveTimer();
    setSeconds(mode === 'focus' && draftTotalSecs ? draftTotalSecs : minutesFor(mode) * 60);
  };

  const applyFocusPreset = (minutes: number) => {
    stopActiveTimer();
    const presetSeconds = minutes * 60;
    setMode('focus');
    setDraftTotalSecs(presetSeconds);
    setSeconds(presetSeconds);
    showToast(`${minutes}m loaded`, 'Focus');
  };

  const toggleFocusBeat = async (beat: FocusBeatId) => {
    if (playingBeat === beat) {
      beatPlayerRef.current?.pause();
      beatPlayerRef.current?.remove();
      beatPlayerRef.current = null;
      setPlayingBeat(null);
      return;
    }
    try {
      beatPlayerRef.current?.pause();
      beatPlayerRef.current?.remove();
      const player = await createFocusBeatPlayer(beat);
      beatPlayerRef.current = player;
      player.play();
      setPlayingBeat(beat);
    } catch {
      setPlayingBeat(null);
      showToast('Beat could not start on this device', 'Pomodoro');
    }
  };

  useEffect(() => () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    beatPlayerRef.current?.remove();
    beatPlayerRef.current = null;
  }, []);

  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  const pct = totalSecs > 0 ? Math.round(((totalSecs - seconds) / totalSecs) * 100) : 0;
  const phase = timerPhase(mode, remainingRatio);
  const activeFocusMinutes = Math.max(1, Math.round(totalSecs / 60));
  const elapsedFocusMinutes = mode === 'focus' ? Math.max(0, Math.floor((totalSecs - seconds) / 60)) : 0;
  const ring = Math.max(220, Math.min(layout.contentWidth - layout.gutter * 2, 260));
  const stroke = 12;
  const radius = (ring - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * progress.value,
    stroke: interpolateColor(
      progress.value,
      mode === 'focus' ? [0, 0.15, 0.33, 0.66, 1] : [0, 0.33, 0.66, 1],
      mode === 'focus'
        ? ['#E84848', '#E84848', '#D97745', '#C6A34A', '#4E8B7A']
        : ['#5E748B', '#5E748B', '#4E7A8B', '#4E8B7A'],
    ),
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: 1 + glow.value * 0.06 }],
    backgroundColor: interpolateColor(
      progress.value,
      mode === 'focus' ? [0, 0.15, 0.33, 0.66, 1] : [0, 0.33, 0.66, 1],
      mode === 'focus'
        ? ['rgba(232,72,72,0.22)', 'rgba(232,72,72,0.2)', 'rgba(217,119,69,0.18)', 'rgba(198,163,74,0.16)', 'rgba(78,139,122,0.16)']
        : ['rgba(6,182,212,0.18)', 'rgba(6,182,212,0.16)', 'rgba(59,130,246,0.16)', 'rgba(78,139,122,0.16)'],
    ),
  }));

  const HeaderRight = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ backgroundColor: accent + '22', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: accent + '44' }}>
        <Text style={{ color: accent, fontWeight: '800', fontSize: 15, lineHeight: 18 }}>{stats.count}/{stats.goal}</Text>
      </View>
      <AnimatedPressable onPress={() => setShowSettings(true)} scaleValue={0.88} haptic="light" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 12, padding: 9 }} accessibilityLabel="Timer settings">
        <GearSix color={colors.textSecondary} size={17} weight="fill" />
      </AnimatedPressable>
    </View>
  );

  return (
    <MiniAppShell title="Pomodoro" subtitle="Flow" headerRight={HeaderRight}>
      <MiniCommandDeck
        accent={accent}
        title="Focus cockpit"
        subtitle="Timer, breaks, streaks."
        metrics={[
          { label: 'Today', value: `${stats.count}/${stats.goal}`, detail: 'goal' },
          { label: 'Timer', value: `${mins}:${secs}`, detail: phase },
          { label: 'Streak', value: `${streak}`, detail: 'days' },
        ]}
        chips={['Background timer', 'Color progress', 'Session proof']}
      />
      <TimerInsightStrip
        mode={mode}
        running={running}
        label={label}
        endAt={endAtLabel}
        nextLabel={nextLabel}
        todayCount={stats.count}
        dailyGoal={stats.goal}
        accent={accent}
      />
      <StageRail mode={mode} elapsedRatio={elapsedRatio} accent={accent} />
      {/* Mode tabs */}
      <GlassPanel variant="light" borderRadius={16} style={{ marginBottom: 18 }} contentStyle={{ flexDirection: 'row', padding: 4, gap: 4 }}>
        {(Object.keys(MODE_META) as Mode[]).map(m => (
          <Pressable
            key={m}
            onPress={() => switchMode(m)}
            style={{ flex: 1 }}
          >
            <View style={{ paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: mode === m ? MODE_META[m].color : 'transparent' }}>
              <Text style={{ color: mode === m ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '800' }}>{MODE_META[m].marker}</Text>
              <Text style={{ color: mode === m ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 11, marginTop: 2 }}>
                {MODE_META[m].label.split(' ')[0]} · {minutesFor(m)}m
              </Text>
            </View>
          </Pressable>
        ))}
      </GlassPanel>
      <FocusPresetRail
        activeMinutes={mode === 'focus' ? activeFocusMinutes : doc.settings.focusMin}
        running={running}
        accent={accent}
        onSelect={applyFocusPreset}
      />

      {/* Task label */}
      <View style={{ marginBottom: 18 }}>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="What are you focusing on?"
          placeholderTextColor={colors.textMuted}
          style={{
            color: colors.text, fontSize: 15, textAlign: 'center',
            backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
            paddingHorizontal: 16, paddingVertical: 12,
          }}
        />
        {quickLabels.length > 0 && !label && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
            {quickLabels.map(l => (
              <Pressable key={l} onPress={() => setLabel(l)}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: accent + '14', borderWidth: 1, borderColor: accent + '33' }}>
                  <Text style={{ color: accent, fontSize: 12.5, fontWeight: '700' }}>{l}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Ring */}
      <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center', marginBottom: 26, alignSelf: 'center' }}>
        {[0, 0.25, 0.5, 0.75].map((point, index) => {
          const angle = point * Math.PI * 2 - Math.PI / 2;
          const distance = ring / 2 - 12;
          const active = elapsedRatio >= point;
          return (
            <View
              key={point}
              style={{
                position: 'absolute',
                left: ring / 2 + Math.cos(angle) * distance - 5,
                top: ring / 2 + Math.sin(angle) * distance - 5,
                width: active ? 10 : 7,
                height: active ? 10 : 7,
                borderRadius: 999,
                backgroundColor: active ? accent : colors.glassBorder,
                opacity: index === 0 || active ? 0.95 : 0.48,
                zIndex: 2,
              }}
            />
          );
        })}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              width: ring - 18,
              height: ring - 18,
              borderRadius: (ring - 18) / 2,
              shadowColor: accent,
              shadowOpacity: 0.4,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: 0 },
            },
            glowStyle,
          ]}
        />
        <Animated.View style={pulseStyle}>
          <Svg width={ring} height={ring} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle
              cx={ring / 2}
              cy={ring / 2}
              r={radius}
              stroke={accent + '18'}
              strokeWidth={stroke + 8}
              fill="transparent"
            />
            <Circle
              cx={ring / 2}
              cy={ring / 2}
              r={radius}
              stroke={colors.isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)'}
              strokeWidth={stroke}
              fill="transparent"
            />
            <AnimatedCircle
              cx={ring / 2}
              cy={ring / 2}
              r={radius}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              animatedProps={animatedCircleProps}
              fill="transparent"
            />
          </Svg>
        </Animated.View>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: ring * 0.24, fontFamily: 'Fraunces_500Medium', letterSpacing: 0, lineHeight: ring * 0.28 }}>
            {mins}:{secs}
          </Text>
          <View style={{ paddingHorizontal: 14, paddingVertical: 5, backgroundColor: accent + '22', borderRadius: 20, borderWidth: 1, borderColor: accent + '44', marginTop: 8 }}>
            <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>
              {running ? `${phase} · ${pct}% done` : pct === 0 ? 'Ready' : `Paused · ${phase}`}
            </Text>
          </View>
        </View>
      </View>

      <FocusMomentumStrip
        accent={accent}
        pct={pct}
        phase={phase}
        stats={stats}
        elapsedMinutes={elapsedFocusMinutes}
        running={running}
      />

      {/* Controls */}
      <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 26 }}>
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
          onPress={running ? stopActiveTimer : startTimer}
          style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', shadowColor: accent, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 6 } }}
        >
          {running ? <Pause color="#fff" size={34} weight="fill" /> : <Play color="#fff" size={34} weight="fill" />}
        </Pressable>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: streak > 0 ? '#B0853618' : (colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'), borderWidth: StyleSheet.hairlineWidth, borderColor: streak > 0 ? '#B0853644' : colors.glassBorder }}>
          <Fire color={streak > 0 ? '#B08536' : colors.textMuted} size={18} weight={streak > 0 ? 'fill' : 'regular'} />
          <Text style={{ color: streak > 0 ? '#B08536' : colors.textMuted, fontSize: 10, fontWeight: '800' }}>{streak}d</Text>
        </View>
      </View>

      <FocusGarden
        accent={accent}
        stats={stats}
        streak={streak}
        elapsedRatio={elapsedRatio}
        running={running}
      />

      <FocusBeatsPanel
        accent={accent}
        playingBeat={playingBeat}
        onToggle={beat => { void toggleFocusBeat(beat); }}
      />

      <FocusIntelligencePanel
        accent={accent}
        stats={stats}
        streak={streak}
        activeMinutes={activeFocusMinutes}
        nextLabel={nextLabel}
        strongestLabel={quickLabels[0]}
      />

      {/* Week chart */}
      <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 16 }} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>LAST 7 DAYS</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{stats.minutes} focus min today</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 64 }}>
          {bars.map((b, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View style={{
                width: '100%', borderRadius: 5,
                height: Math.max(4, (b.count / maxBar) * 52),
                backgroundColor: b.isToday ? accent : (b.count >= doc.settings.dailyGoal ? accent + 'AA' : accent + '33'),
              }} />
              <Text style={{ color: b.isToday ? accent : colors.textMuted, fontSize: 9.5, fontWeight: b.isToday ? '800' : '500' }}>{b.label}</Text>
            </View>
          ))}
        </View>
      </GlassPanel>

      <EdgeFeaturePanel
        appId="pomodoro"
        appName="Pomodoro"
        accent={accent}
        headline="Focus becomes visible progress"
        caption="Turn deep work cycles into proof, accountability, and a next-action plan."
        metrics={[
          { label: 'Today', value: `${stats.count}/${stats.goal}` },
          { label: 'Focus min', value: `${stats.minutes}` },
          { label: 'Day streak', value: `${streak}` },
        ]}
        prompt="Use my focus sessions to plan the next 3 actions and help me protect the next deep-work block."
        shareText={`Pomodoro: ${stats.count} focus sessions today (${stats.minutes} min), ${streak}-day goal streak.`}
        publishTitle="Focus progress"
        publishBody={`I completed ${stats.count} focus sessions today — ${stats.minutes} minutes of deep work, on a ${streak}-day streak.`}
      />

      {/* Today's log */}
      {todaySessions.length > 0 && (
        <GlassPanel variant="light" borderRadius={20} contentStyle={{ overflow: 'hidden' }} style={{ marginTop: 14 }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>TODAY</Text>
          </View>
          {todaySessions.slice(0, 10).map((s, i, arr) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.glassBorder }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                {s.label || 'Focus session'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>
                {s.minutes}m · {new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}
        </GlassPanel>
      )}

      {showSettings && (
        <SettingsSheet
          settings={doc.settings}
          onSave={s => {
            update({ ...doc, settings: s });
            if (!running) setSeconds(minutesFor(mode, s) * 60);
            showToast('Settings saved', 'Saved');
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </MiniAppShell>
  );
}
