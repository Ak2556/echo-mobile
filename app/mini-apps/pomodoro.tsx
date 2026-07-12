import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { View, Text, TextInput, Pressable, StyleSheet, Modal, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Pause, ArrowCounterClockwise, GearSix, Fire, Minus, Plus, X } from 'phosphor-react-native';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';
import { showToast } from '../../components/ui/Toast';
import {
  PomodoroDoc, PomodoroSettings, DEFAULT_POMODORO_SETTINGS,
  goalStreak, loadPomodoro, savePomodoro, sessionsOn, todayStats, topLabels, weekBars,
} from '../../lib/pomodoro';

type Mode = 'focus' | 'short' | 'long';

const MODE_META: Record<Mode, { label: string; marker: string; color: string }> = {
  focus: { label: 'Focus', marker: 'FO', color: '#C65F3F' },
  short: { label: 'Short Break', marker: 'SB', color: '#4E8B7A' },
  long: { label: 'Long Break', marker: 'LB', color: '#4E7A8B' },
};

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

export default function PomodoroScreen() {
  const { colors } = useTheme();
  const layout = useResponsiveLayout();

  const [doc, setDoc] = useState<PomodoroDoc>({ sessions: [], settings: DEFAULT_POMODORO_SETTINGS });
  const [mode, setMode] = useState<Mode>('focus');
  const [seconds, setSeconds] = useState(DEFAULT_POMODORO_SETTINGS.focusMin * 60);
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    void loadPomodoro().then(loaded => {
      setDoc(loaded);
      setSeconds(loaded.settings.focusMin * 60);
    });
  }, []);

  const minutesFor = useCallback((m: Mode, s: PomodoroSettings = docRef.current.settings) =>
    m === 'focus' ? s.focusMin : m === 'short' ? s.shortMin : s.longMin, []);

  const meta = MODE_META[mode];
  const totalSecs = minutesFor(mode) * 60;
  const accent = meta.color;
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(seconds / Math.max(totalSecs, 1), { duration: 600, easing: Easing.out(Easing.ease) });
  }, [seconds, totalSecs, progress]);

  const stats = todayStats(doc);
  const streak = goalStreak(doc);
  const bars = weekBars(doc);
  const maxBar = Math.max(1, ...bars.map(b => b.count), doc.settings.dailyGoal);
  const quickLabels = topLabels(doc);
  const todaySessions = sessionsOn(doc.sessions, new Date().toISOString().slice(0, 10));

  const update = (next: PomodoroDoc) => { setDoc(next); void savePomodoro(next); };

  // The JS interval dies when the app backgrounds — a scheduled local
  // notification carries the "time's up" moment to the lock screen instead.
  const notifIdRef = useRef<string | null>(null);
  useEffect(() => {
    const cancelScheduled = () => {
      if (notifIdRef.current) {
        void Notifications.cancelScheduledNotificationAsync(notifIdRef.current).catch(() => {});
        notifIdRef.current = null;
      }
    };
    if (running && seconds > 0) {
      void Notifications.scheduleNotificationAsync({
        content: {
          title: mode === 'focus' ? 'Focus session complete' : 'Break over',
          body: mode === 'focus'
            ? `${minutesFor('focus')} minutes of focus done — take a break.`
            : 'Back to it — start your next focus session.',
          sound: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
      }).then(id => { notifIdRef.current = id; }).catch(() => {});
    } else {
      cancelScheduled();
    }
    return cancelScheduled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const completeTimer = useCallback(() => {
    setRunning(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (mode === 'focus') {
      const d = docRef.current;
      const next: PomodoroDoc = {
        ...d,
        sessions: [
          { id: Date.now().toString(), label: label.trim(), minutes: d.settings.focusMin, at: new Date().toISOString() },
          ...d.sessions,
        ],
      };
      update(next);
      const doneToday = sessionsOn(next.sessions, new Date().toISOString().slice(0, 10)).length;
      if (doneToday === next.settings.dailyGoal) showToast(`🎯 Daily goal hit — ${doneToday} sessions`, 'Goal');
      const nextMode: Mode = doneToday % next.settings.longEvery === 0 ? 'long' : 'short';
      setMode(nextMode);
      setSeconds(minutesFor(nextMode, next.settings) * 60);
      if (next.settings.autoStartBreaks) setRunning(true);
    } else {
      setMode('focus');
      setSeconds(minutesFor('focus') * 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, label, minutesFor]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            // Defer the state cascade out of the setState updater.
            setTimeout(completeTimer, 0);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, completeTimer]);

  const switchMode = (m: Mode) => {
    setRunning(false);
    setMode(m);
    setSeconds(minutesFor(m) * 60);
  };

  const reset = () => {
    setRunning(false);
    setSeconds(totalSecs);
  };

  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  const pct = totalSecs > 0 ? Math.round(((totalSecs - seconds) / totalSecs) * 100) : 0;
  const ring = Math.max(220, Math.min(layout.contentWidth - layout.gutter * 2, 260));

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
    <MiniAppShell title="Pomodoro" subtitle="Stay in the zone" headerRight={HeaderRight}>
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
        <View style={{ position: 'absolute', width: ring, height: ring, borderRadius: ring / 2, borderWidth: 16, borderColor: accent + '18' }} />
        <View style={{ position: 'absolute', width: ring - 16, height: ring - 16, borderRadius: (ring - 16) / 2, borderWidth: 4, borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />
        <View style={{ position: 'absolute', width: ring - 16, height: ring - 16, borderRadius: (ring - 16) / 2, borderWidth: 4, borderColor: accent, borderRightColor: 'transparent', borderBottomColor: pct > 25 ? accent : 'transparent', borderLeftColor: pct > 50 ? accent : 'transparent', borderTopColor: pct > 75 ? 'transparent' : accent }} />
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: ring * 0.24, fontFamily: 'Fraunces_500Medium', letterSpacing: 0, lineHeight: ring * 0.28 }}>
            {mins}:{secs}
          </Text>
          <View style={{ paddingHorizontal: 14, paddingVertical: 5, backgroundColor: accent + '22', borderRadius: 20, borderWidth: 1, borderColor: accent + '44', marginTop: 8 }}>
            <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>
              {running ? `${pct}% done` : pct === 0 ? 'Ready' : 'Paused'}
            </Text>
          </View>
        </View>
      </View>

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
          onPress={() => setRunning(r => !r)}
          style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', shadowColor: accent, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 6 } }}
        >
          {running ? <Pause color="#fff" size={34} weight="fill" /> : <Play color="#fff" size={34} weight="fill" />}
        </Pressable>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: streak > 0 ? '#B0853618' : (colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'), borderWidth: StyleSheet.hairlineWidth, borderColor: streak > 0 ? '#B0853644' : colors.glassBorder }}>
          <Fire color={streak > 0 ? '#B08536' : colors.textMuted} size={18} weight={streak > 0 ? 'fill' : 'regular'} />
          <Text style={{ color: streak > 0 ? '#B08536' : colors.textMuted, fontSize: 10, fontWeight: '800' }}>{streak}d</Text>
        </View>
      </View>

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
