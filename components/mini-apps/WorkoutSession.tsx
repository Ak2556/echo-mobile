import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Check, SkipForward, Trophy, X } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { ExerciseDemo } from './ExerciseDemo';
import { EXERCISES, EXERCISE_CATALOG } from '../../lib/exerciseLibrary';
import {
  Routine, Workout, WorkoutExercise,
  bestLiftFor, detectPRs, lastLiftFor, workoutVolume,
} from '../../lib/fitness';

const TEAL = '#14B8A6';

interface ExerciseState {
  weight: string;
  reps: string;
  setsDone: number;
}

function fmtClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Guided follow-along mode for a routine: one exercise at a time, tap off
 * sets, rest countdown between sets (with a local notification so a
 * backgrounded phone still buzzes), weights prefilled from your last session,
 * and a PR check when you finish.
 */
export function WorkoutSession({ routine, history, onFinish, onClose }: {
  routine: Routine;
  history: Workout[];
  onFinish: (workout: Workout, prs: { name: string; weight: number; reps: number }[]) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [exIndex, setExIndex] = useState(0);
  const [states, setStates] = useState<ExerciseState[]>(() =>
    routine.exercises.map(e => {
      const last = lastLiftFor(history, e.name);
      return {
        weight: String(last?.weight ?? e.weight ?? 0),
        reps: String(last?.reps ?? e.reps ?? 10),
        setsDone: 0,
      };
    }),
  );
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<{ workout: Workout; prs: { name: string; weight: number; reps: number }[] } | null>(null);

  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restNotifRef = useRef<string | null>(null);
  const startedAt = useRef(Date.now());

  // Session clock
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Cleanup rest timer + pending notification on unmount
  useEffect(() => () => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    if (restNotifRef.current) void Notifications.cancelScheduledNotificationAsync(restNotifRef.current).catch(() => {});
  }, []);

  const exercise = routine.exercises[exIndex];
  const state = states[exIndex];
  const catalogEntry = EXERCISE_CATALOG.find(c => c.name.toLowerCase() === exercise.name.toLowerCase());
  const demo = catalogEntry?.demoId ? EXERCISES.find(e => e.id === catalogEntry.demoId) : undefined;
  const last = useMemo(() => lastLiftFor(history, exercise.name), [history, exercise.name]);
  const best = useMemo(() => bestLiftFor(history, exercise.name), [history, exercise.name]);

  const isLastExercise = exIndex === routine.exercises.length - 1;
  const allSetsDone = state.setsDone >= exercise.sets;

  const stopRest = () => {
    if (restTimerRef.current) { clearInterval(restTimerRef.current); restTimerRef.current = null; }
    if (restNotifRef.current) { void Notifications.cancelScheduledNotificationAsync(restNotifRef.current).catch(() => {}); restNotifRef.current = null; }
    setRestLeft(null);
  };

  const startRest = () => {
    stopRest();
    if (routine.restSec <= 0) return;
    setRestLeft(routine.restSec);
    restTimerRef.current = setInterval(() => {
      setRestLeft(prev => {
        if (prev === null || prev <= 1) {
          stopRest();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    // Backgrounded rest still ends loudly.
    void Notifications.scheduleNotificationAsync({
      content: { title: 'Rest over', body: `Back to ${exercise.name}.`, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: routine.restSec },
    }).then(id => { restNotifRef.current = id; }).catch(() => {});
  };

  const completeSet = () => {
    if (allSetsDone) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nextDone = state.setsDone + 1;
    setStates(prev => prev.map((s, i) => (i === exIndex ? { ...s, setsDone: nextDone } : s)));
    const lastSetOfLastExercise = isLastExercise && nextDone >= exercise.sets;
    if (!lastSetOfLastExercise) startRest();
  };

  const setState = (patch: Partial<ExerciseState>) =>
    setStates(prev => prev.map((s, i) => (i === exIndex ? { ...s, ...patch } : s)));

  const nextExercise = () => {
    stopRest();
    if (!isLastExercise) setExIndex(i => i + 1);
  };

  const finish = () => {
    stopRest();
    const exercises: WorkoutExercise[] = routine.exercises
      .map((e, i) => ({
        name: e.name,
        sets: states[i].setsDone,
        reps: Math.max(1, Math.round(parseFloat(states[i].reps) || e.reps)),
        weight: Math.max(0, parseFloat(states[i].weight) || 0),
      }))
      .filter(e => e.sets > 0);
    if (exercises.length === 0) {
      Alert.alert('Nothing logged', 'Complete at least one set, or close without saving.');
      return;
    }
    const workout: Workout = {
      id: Date.now().toString(),
      title: routine.title,
      exercises,
      date: new Date().toISOString(),
    };
    const prs = detectPRs(history, workout);
    if (prs.length) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSummary({ workout, prs });
  };

  const confirmClose = () => {
    const anyDone = states.some(s => s.setsDone > 0);
    if (!anyDone) { onClose(); return; }
    Alert.alert('Leave workout?', 'Progress from this session will be lost.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: onClose },
    ]);
  };

  // ── Completion summary ──────────────────────────────────────────────────
  if (summary) {
    const vol = Math.round(workoutVolume(summary.workout));
    const totalSets = summary.workout.exercises.reduce((s, e) => s + e.sets, 0);
    return (
      <Modal animationType="fade" onRequestClose={() => onFinish(summary.workout, summary.prs)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
          <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 48, gap: 18 }}>
            <Text style={{ color: colors.text, fontSize: 34, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1 }}>
              Done.
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 23, fontFamily: 'Fraunces_400Regular_Italic' }}>
              {summary.prs.length
                ? `${summary.prs.length} personal ${summary.prs.length === 1 ? 'record' : 'records'} today.`
                : 'Showing up is the whole game.'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              {[
                { label: 'TIME', value: fmtClock(elapsed) },
                { label: 'SETS', value: String(totalSets) },
                { label: 'VOLUME', value: `${vol.toLocaleString()} kg` },
              ].map(stat => (
                <View key={stat.label} style={{ flex: 1, backgroundColor: TEAL + '14', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: TEAL + '2A' }}>
                  <Text style={{ color: TEAL, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8 }}>{stat.label}</Text>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 }}>{stat.value}</Text>
                </View>
              ))}
            </View>

            {summary.prs.map(pr => (
              <View key={pr.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#B0853618', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#B0853640' }}>
                <Trophy color="#B08536" size={20} weight="fill" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{pr.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>New best — {pr.weight} kg × {pr.reps}</Text>
                </View>
              </View>
            ))}

            <AnimatedPressable
              onPress={() => onFinish(summary.workout, summary.prs)}
              scaleValue={0.96} haptic="medium"
              style={{ backgroundColor: TEAL, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Save workout</Text>
            </AnimatedPressable>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  // ── Live session ────────────────────────────────────────────────────────
  return (
    <Modal animationType="slide" onRequestClose={confirmClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 19, fontFamily: 'Fraunces_600SemiBold' }}>{routine.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
              Exercise {exIndex + 1} of {routine.exercises.length} · {fmtClock(elapsed)}
            </Text>
          </View>
          <AnimatedPressable onPress={confirmClose} scaleValue={0.9} haptic="light" style={{ padding: 8 }}>
            <X color={colors.textMuted} size={22} />
          </AnimatedPressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 28, gap: 16 }} keyboardShouldPersistTaps="handled">
          {/* Current exercise */}
          <View style={{ borderRadius: 24, backgroundColor: colors.surface, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: TEAL + '44' }}>
            <Text style={{ color: colors.text, fontSize: 24, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5 }}>
              {exercise.name}
            </Text>
            {catalogEntry ? (
              <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 3 }}>
                {catalogEntry.muscle} · {catalogEntry.equipment}
              </Text>
            ) : null}

            {demo ? (
              <View style={{ alignItems: 'center', backgroundColor: TEAL + '0E', borderRadius: 16, paddingVertical: 6, marginTop: 12 }}>
                <ExerciseDemo exercise={demo} color={TEAL} muted={colors.textMuted} size={120} />
              </View>
            ) : null}

            {(last || best) && (
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 12 }}>
                {last ? `Last time ${last.sets}×${last.reps}${last.weight > 0 ? ` @ ${last.weight} kg` : ''}` : ''}
                {last && best ? '  ·  ' : ''}
                {best ? `Best ${best.weight} kg × ${best.reps}` : ''}
              </Text>
            )}

            {/* Weight / reps */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              {([['WEIGHT (KG)', 'weight'], ['REPS', 'reps']] as const).map(([label, key]) => (
                <View key={key} style={{ flex: 1 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 }}>{label}</Text>
                  <TextInput
                    value={state[key]}
                    onChangeText={v => setState({ [key]: v } as Partial<ExerciseState>)}
                    keyboardType="decimal-pad"
                    style={{
                      color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center',
                      backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      borderRadius: 14, paddingVertical: 12,
                      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
                    }}
                  />
                </View>
              ))}
            </View>

            {/* Set dots */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'center' }}>
              {Array.from({ length: exercise.sets }).map((_, i) => {
                const done = i < state.setsDone;
                return (
                  <View key={i} style={{
                    width: 40, height: 40, borderRadius: 20,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: done ? TEAL : 'transparent',
                    borderWidth: 2, borderColor: done ? TEAL : colors.glassBorder,
                  }}>
                    {done
                      ? <Check color="#fff" size={17} weight="bold" />
                      : <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700' }}>{i + 1}</Text>}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Rest countdown */}
          {restLeft !== null ? (
            <View style={{ borderRadius: 20, backgroundColor: TEAL + '14', borderWidth: 1, borderColor: TEAL + '33', padding: 18, alignItems: 'center', gap: 6 }}>
              <Text style={{ color: TEAL, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>REST</Text>
              <Text style={{ color: colors.text, fontSize: 44, fontFamily: 'Fraunces_600SemiBold', fontVariant: ['tabular-nums'] }}>
                {fmtClock(restLeft)}
              </Text>
              <Pressable onPress={stopRest} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 }}>
                <SkipForward color={colors.textMuted} size={14} weight="fill" />
                <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>Skip rest</Text>
              </Pressable>
            </View>
          ) : (
            <AnimatedPressable
              onPress={allSetsDone ? (isLastExercise ? finish : nextExercise) : completeSet}
              scaleValue={0.96} haptic="medium"
              style={{ backgroundColor: TEAL, borderRadius: 18, paddingVertical: 18, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
                {allSetsDone
                  ? (isLastExercise ? 'Finish workout' : 'Next exercise')
                  : `Complete set ${state.setsDone + 1}`}
              </Text>
            </AnimatedPressable>
          )}

          {/* Skip ahead / next up */}
          {!isLastExercise && (
            <Pressable onPress={nextExercise} hitSlop={6}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', flex: 1 }}>
                  Next up
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13.5 }}>
                  {routine.exercises[exIndex + 1].name} →
                </Text>
              </View>
            </Pressable>
          )}
          {isLastExercise && !allSetsDone && (
            <Pressable onPress={finish} hitSlop={6}>
              <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 6 }}>
                Finish early
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
