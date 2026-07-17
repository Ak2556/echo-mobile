import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, Alert, Modal, StyleSheet, Image, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Plus, Minus, CheckCircle, CircleDashed, Fire, Trash, X, Camera, Images, Clock, NotePencil, Bell } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniEmptyState } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import {
  HABIT_COLORS, HABIT_MARKERS, Habit, HabitCheckIn, checkInFor, formatCheckInTime,
  getHabitStreak, isScheduledOn, dayCountFor, STREAK_MILESTONES,
  loadHabits, saveHabits, setCheckInDetails, thisWeekCount, todayStr,
} from '../../lib/habits';
import { HabitDetail } from '../../components/mini-apps/HabitDetail';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const GOAL_OPTIONS = [3, 4, 5, 6, 7];
const REMINDER_OPTIONS: { label: string; value: { hour: number; minute: number } | null }[] = [
  { label: 'None', value: null },
  { label: '8:00', value: { hour: 8, minute: 0 } },
  { label: '13:00', value: { hour: 13, minute: 0 } },
  { label: '18:00', value: { hour: 18, minute: 0 } },
  { label: '21:00', value: { hour: 21, minute: 0 } },
];

// Reminder notification ids are per-device: kept in AsyncStorage, never in
// the synced habit doc — another device schedules (and cancels) its own.
const notifKey = (habitId: string) => `mini:habits:notif:${habitId}`;

async function syncReminder(habit: Habit): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(notifKey(habit.id));
    if (existing) {
      await Notifications.cancelScheduledNotificationAsync(existing).catch(() => {});
      await AsyncStorage.removeItem(notifKey(habit.id));
    }
    if (!habit.reminder) return;
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: habit.name,
        body: 'Time to keep the streak going.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: habit.reminder.hour,
        minute: habit.reminder.minute,
      },
    });
    await AsyncStorage.setItem(notifKey(habit.id), id);
  } catch {
    // Notifications unavailable (old build, denied) — habit still works.
  }
}

async function cancelReminder(habitId: string): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(notifKey(habitId));
    if (existing) {
      await Notifications.cancelScheduledNotificationAsync(existing).catch(() => {});
      await AsyncStorage.removeItem(notifKey(habitId));
    }
  } catch {}
}

/** 12-week completion heatmap, GitHub style: columns = weeks, rows = days. */
function Heatmap({ habit, colors }: { habit: Habit; colors: any }) {
  const done = new Set(habit.completedDates);
  const today = new Date();
  const weeks = 12;
  // Start from the Monday `weeks-1` weeks back.
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
  const cols = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const cell = new Date(start); cell.setDate(start.getDate() + w * 7 + d);
      return cell.toISOString().slice(0, 10);
    }),
  );
  const todayIso = todayStr();
  return (
    <View style={{ flexDirection: 'row', gap: 3, marginTop: 12, justifyContent: 'center' }}>
      {cols.map((col, w) => (
        <View key={w} style={{ gap: 3 }}>
          {col.map(date => {
            const future = date > todayIso;
            return (
              <View
                key={date}
                style={{
                  width: 11, height: 11, borderRadius: 3,
                  backgroundColor: future
                    ? 'transparent'
                    : done.has(date)
                      ? habit.color
                      : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'),
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function WeekRow({ habit, colors, onDayPress }: { habit: Habit; colors: any; onDayPress: (date: string) => void }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - 6 + i);
    return d.toISOString().slice(0, 10);
  });
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 10 }}>
      {days.map((dateStr, i) => {
        const done = habit.completedDates.includes(dateStr);
        const isToday = dateStr === todayStr();
        const entry = checkInFor(habit, dateStr);
        const hasProof = !!(entry?.note || entry?.photoUri);
        const scheduled = isScheduledOn(habit, dateStr);
        return (
          <Pressable key={i} onPress={done ? () => onDayPress(dateStr) : undefined} style={{ flex: 1 }}>
            <View style={{ alignItems: 'center', gap: 4, opacity: scheduled ? 1 : 0.3 }}>
              <Text style={{ color: isToday ? habit.color : colors.textMuted, fontSize: 10, fontWeight: isToday ? '700' : '400' }}>
                {DAYS[new Date(dateStr + 'T12:00:00').getDay()]}
              </Text>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: done ? habit.color : 'transparent', borderWidth: 1.5, borderColor: done ? habit.color : isToday ? habit.color + '55' : colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
                {done && <CheckCircle color="#fff" size={14} weight="fill" />}
              </View>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: hasProof ? habit.color : 'transparent' }} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Persist a picked image outside the picker cache so it survives restarts. */
async function stashProofPhoto(habitId: string, date: string, srcUri: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}habit-proof/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}${habitId}-${date}-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: srcUri, to: dest });
  return dest;
}

function ProofModal({ habit, date, onSaved, onClose }: {
  habit: Habit; date: string; onSaved: (h: Habit) => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const entry: HabitCheckIn | undefined = checkInFor(habit, date);
  const [note, setNote] = useState(entry?.note ?? '');
  const [photoUri, setPhotoUri] = useState(entry?.photoUri ?? '');
  const [photoOk, setPhotoOk] = useState(true);
  const isToday = date === todayStr();
  const dayLabel = isToday ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const pick = async (source: 'camera' | 'library') => {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showToast('Permission needed to add a photo', 'Photos'); return; }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const stashed = await stashProofPhoto(habit.id, date, result.assets[0].uri);
      setPhotoUri(stashed);
      setPhotoOk(true);
    } catch {
      showToast('Could not add the photo', 'Error');
    }
  };

  const save = async () => {
    try {
      const updated = await setCheckInDetails(habit.id, date, {
        note: note.trim() || undefined,
        photoUri: photoUri || undefined,
      });
      onSaved(updated);
      showToast('Check-in saved', 'Saved');
      onClose();
    } catch {
      showToast('Could not save', 'Error');
    }
  };

  const pickBtn = (label: string, icon: React.ReactNode, source: 'camera' | 'library') => (
    <Pressable onPress={() => pick(source)} style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', gap: 6, paddingVertical: 18, borderRadius: 14, borderWidth: 1, borderColor: habit.color + '55', borderStyle: 'dashed', backgroundColor: habit.color + '0C' }}>
        {icon}
        <Text style={{ color: habit.color, fontWeight: '700', fontSize: 13 }}>{label}</Text>
      </View>
    </Pressable>
  );

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{habit.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{dayLabel}</Text>
          </View>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light"><X color={colors.textMuted} size={22} /></AnimatedPressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 22 }} keyboardShouldPersistTaps="handled">
          {entry?.at ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Clock color={habit.color} size={16} weight="fill" />
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                Checked off at <Text style={{ color: colors.text, fontWeight: '700' }}>{formatCheckInTime(entry.at)}</Text>
              </Text>
            </View>
          ) : null}

          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>NOTE</Text>
            <TextInput
              value={note} onChangeText={setNote} multiline
              placeholder="How did it go? What did you do?"
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, fontSize: 15, minHeight: 84, textAlignVertical: 'top', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 16, paddingVertical: 14 }}
            />
          </View>

          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>PHOTO PROOF</Text>
            {photoUri && photoOk ? (
              <View>
                <Image
                  source={{ uri: photoUri }}
                  onError={() => setPhotoOk(false)}
                  style={{ width: '100%', height: 220, borderRadius: 16, backgroundColor: colors.surface }}
                  resizeMode="cover"
                />
                <AnimatedPressable onPress={() => setPhotoUri('')} scaleValue={0.9} haptic="light" style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: 7 }}>
                  <X color="#fff" size={15} weight="bold" />
                </AnimatedPressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {pickBtn('Take photo', <Camera color={habit.color} size={22} weight="fill" />, 'camera')}
                {pickBtn('Choose photo', <Images color={habit.color} size={22} weight="fill" />, 'library')}
              </View>
            )}
            {photoUri && !photoOk ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
                This photo lives on another device.
              </Text>
            ) : null}
          </View>

          <AnimatedPressable onPress={save} scaleValue={0.96} haptic="medium" style={{ backgroundColor: habit.color, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: habit.color, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Save</Text>
          </AnimatedPressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function AddHabitModal({ initial, onSave, onClose }: {
  initial?: Habit | null;
  onSave: (h: Habit) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const accent = '#C65F3F'; // terracotta — warm editorial palette
  const [name, setName] = useState(initial?.name ?? '');
  const [marker, setMarker] = useState(initial?.marker ?? HABIT_MARKERS[0]);
  const [color, setColor] = useState(initial?.color ?? accent);
  const [goal, setGoal] = useState(initial?.weeklyGoal ?? 7);
  const [reminder, setReminder] = useState<{ hour: number; minute: number } | null>(initial?.reminder ?? null);
  const [days, setDays] = useState<number[]>(initial?.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [target, setTarget] = useState(initial?.dailyTarget ?? 1);

  const toggleDay = (d: number) => {
    setDays(prev => {
      const next = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort();
      return next.length === 0 ? prev : next; // at least one day
    });
  };

  const submit = () => {
    if (!name.trim()) { showToast('Enter a habit name', 'Error'); return; }
    onSave({
      id: initial?.id ?? Date.now().toString(),
      name: name.trim(), marker, color,
      completedDates: initial?.completedDates ?? [],
      log: initial?.log ?? [],
      dayCounts: initial?.dayCounts,
      archived: initial?.archived,
      weeklyGoal: goal === 7 ? undefined : goal,
      reminder,
      scheduledDays: days.length === 7 ? undefined : days,
      dailyTarget: target > 1 ? target : undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{initial ? 'Edit Habit' : 'New Habit'}</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light"><X color={colors.textMuted} size={22} /></AnimatedPressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>HABIT NAME</Text>
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Drink water, Exercise…" placeholderTextColor={colors.textMuted} autoFocus style={{ color: colors.text, fontSize: 16, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 16, paddingVertical: 14 }} />
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>ICON</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {HABIT_MARKERS.map(e => (
                <Pressable key={e} onPress={() => setMarker(e)}>
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: marker === e ? color + '22' : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: marker === e ? 2 : StyleSheet.hairlineWidth, borderColor: marker === e ? color : colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: marker === e ? color : colors.textMuted, fontSize: 12, fontWeight: '800' }}>{e}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>COLOR</Text>
            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              {HABIT_COLORS.map(c => (
                <Pressable key={c} onPress={() => setColor(c)}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: '#fff', transform: [{ scale: color === c ? 1.15 : 1 }] }} />
                </Pressable>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>WHICH DAYS</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {WEEKDAY_LABELS.map((label, d) => {
                const active = days.includes(d);
                return (
                  <Pressable key={d} onPress={() => toggleDay(d)} style={{ flex: 1 }}>
                    <View style={{ paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: active ? color : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: StyleSheet.hairlineWidth, borderColor: active ? 'transparent' : colors.glassBorder }}>
                      <Text style={{ color: active ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 12.5 }}>{label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>TIMES PER DAY</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <AnimatedPressable onPress={() => setTarget(t => Math.max(1, t - 1))} scaleValue={0.85} haptic="light" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 12, padding: 11 }}>
                <Minus color={colors.text} size={15} weight="bold" />
              </AnimatedPressable>
              <View style={{ minWidth: 70, alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{target}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{target === 1 ? 'simple check' : 'taps to complete'}</Text>
              </View>
              <AnimatedPressable onPress={() => setTarget(t => Math.min(20, t + 1))} scaleValue={0.85} haptic="light" style={{ backgroundColor: color, borderRadius: 12, padding: 11 }}>
                <Plus color="#fff" size={15} weight="bold" />
              </AnimatedPressable>
            </View>
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>TIMES PER WEEK</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {GOAL_OPTIONS.map(g => (
                <Pressable key={g} onPress={() => setGoal(g)} style={{ flex: 1 }}>
                  <View style={{ paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: goal === g ? color : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: StyleSheet.hairlineWidth, borderColor: goal === g ? 'transparent' : colors.glassBorder }}>
                    <Text style={{ color: goal === g ? '#fff' : colors.text, fontWeight: '700', fontSize: 13 }}>{g === 7 ? 'Daily' : g}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>DAILY REMINDER</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {REMINDER_OPTIONS.map(opt => {
                const active = (reminder?.hour ?? -1) === (opt.value?.hour ?? -1);
                return (
                  <Pressable key={opt.label} onPress={() => setReminder(opt.value)} style={{ flex: 1 }}>
                    <View style={{ paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: active ? color : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: StyleSheet.hairlineWidth, borderColor: active ? 'transparent' : colors.glassBorder }}>
                      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 12.5 }}>{opt.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <AnimatedPressable onPress={submit} scaleValue={0.96} haptic="medium" style={{ backgroundColor: color, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: color, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{initial ? 'Save Changes' : 'Add Habit'}</Text>
          </AnimatedPressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function HabitsApp() {
  const { colors, font } = useTheme();
  const accent = '#C65F3F'; // terracotta — warm editorial palette
  const [habits, setHabits] = useState<Habit[]>([]);
  useEffect(() => { loadHabits().then(setHabits); }, []);
  useFocusEffect(
    React.useCallback(() => {
      loadHabits().then(setHabits);
    }, []),
  );
  const [showAdd, setShowAdd] = useState(false);
  const [proof, setProof] = useState<{ habitId: string; date: string } | null>(null);
  const today = todayStr();

  const active = habits.filter(h => !h.archived);
  const archived = habits.filter(h => h.archived);
  const dueToday = active.filter(h => isScheduledOn(h, today));
  const doneToday = dueToday.filter(h => h.completedDates.includes(today)).length;
  const pct = dueToday.length > 0 ? Math.round((doneToday / dueToday.length) * 100) : 0;
  const bestStreak = active.reduce((max, habit) => Math.max(max, getHabitStreak(habit)), 0);
  const proofCount = active.reduce((sum, habit) => sum + (habit.log ?? []).filter(entry => entry.note || entry.photoUri).length, 0);

  // One tap = one increment; quantity habits complete at their target, and a
  // tap on a completed day unchecks/resets it.
  const bumpHabit = (id: string) => {
    let milestone: { streak: number; name: string } | null = null;
    const updated = habits.map(h => {
      if (h.id !== id) return h;
      const target = h.dailyTarget ?? 1;
      const cur = dayCountFor(h, today);
      if (cur >= target) {
        return {
          ...h,
          completedDates: h.completedDates.filter(d => d !== today),
          dayCounts: h.dailyTarget ? { ...(h.dayCounts ?? {}), [today]: 0 } : h.dayCounts,
          log: (h.log ?? []).filter(entry => entry.date !== today),
        };
      }
      const next = cur + 1;
      const nowDone = next >= target;
      const result: Habit = {
        ...h,
        dayCounts: h.dailyTarget ? { ...(h.dayCounts ?? {}), [today]: next } : h.dayCounts,
        completedDates: nowDone ? [...h.completedDates, today] : h.completedDates,
        log: nowDone
          ? [...(h.log ?? []).filter(entry => entry.date !== today), { date: today, at: new Date().toISOString() }]
          : h.log,
      };
      if (nowDone) {
        const s = getHabitStreak(result);
        if (STREAK_MILESTONES.includes(s)) milestone = { streak: s, name: result.name };
      }
      return result;
    });
    setHabits(updated); saveHabits(updated);
    if (milestone) {
      const m = milestone as { streak: number; name: string };
      showToast(`🎉 ${m.streak}-day streak — ${m.name}!`, 'Streak');
    }
  };

  const onProofSaved = (updated: Habit) => {
    setHabits(habits.map(h => h.id === updated.id ? updated : h));
  };

  const saveHabit = (h: Habit) => {
    const exists = habits.some(x => x.id === h.id);
    const updated = exists ? habits.map(x => x.id === h.id ? h : x) : [h, ...habits];
    setHabits(updated); saveHabits(updated);
    void syncReminder(h);
    showToast(exists ? 'Habit updated' : `${h.name} added`, 'Saved');
  };

  const deleteHabit = (id: string) => {
    const updated = habits.filter(h => h.id !== id);
    setHabits(updated); saveHabits(updated);
    void cancelReminder(id);
    setDetailId(null);
  };

  const toggleArchive = (id: string) => {
    const updated = habits.map(h => h.id === id ? { ...h, archived: !h.archived } : h);
    setHabits(updated); saveHabits(updated);
  };

  const [heatmapFor, setHeatmapFor] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editHabit, setEditHabit] = useState<Habit | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const detailHabit = detailId ? habits.find(h => h.id === detailId) ?? null : null;

  const todayLabel = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const AddBtn = (
    <AnimatedPressable onPress={() => setShowAdd(true)} scaleValue={0.88} haptic="medium" style={{ backgroundColor: accent, borderRadius: 12, padding: 10 }}>
      <Plus color="#fff" size={18} weight="bold" />
    </AnimatedPressable>
  );

  return (
    <MiniAppShell title="Habits" subtitle={todayLabel} headerRight={AddBtn}>
      {/* Progress */}
      {dueToday.length > 0 && (
        <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: '900' }}>{pct}%</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{doneToday} of {dueToday.length} due today</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Fire color={pct === 100 ? '#B08536' : colors.textMuted} size={36} weight={pct === 100 ? 'fill' : 'thin'} />
              {pct === 100 && <Text style={{ color: '#B08536', fontSize: 11, fontWeight: '700' }}>Perfect!</Text>}
            </View>
          </View>
          <View style={{ height: 8, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${pct}%`, backgroundColor: accent, borderRadius: 4 }} />
          </View>
        </GlassPanel>
      )}

      <EdgeFeaturePanel
        appName="Habits"
        accent={accent}
        headline="Make consistency social"
        caption="Share streaks, compare progress, and turn proof-backed habits into public updates."
        metrics={[
          { label: 'Today', value: `${doneToday}/${dueToday.length}` },
          { label: 'Best streak', value: `${bestStreak}` },
          { label: 'Proofs', value: `${proofCount}` },
        ]}
        prompt="Review my habit streaks and help me choose the smallest realistic next action for today."
        shareText={`Habit progress: ${doneToday}/${dueToday.length} habits done today, best streak ${bestStreak} days, ${proofCount} proof notes/photos saved.`}
        publishTitle="Habit progress"
        publishBody={`Today I completed ${doneToday} of ${dueToday.length} scheduled habits. My best active streak is ${bestStreak} days, with ${proofCount} proof-backed check-ins.`}
      />

      {active.length === 0 && archived.length === 0 && (
        <MiniEmptyState
          accent={accent}
          icon={<Fire color={colors.textMuted} size={48} weight="thin" />}
          title="No habits yet"
          subtitle="Build a routine you can keep — start with one small daily habit."
          actionLabel="Add your first habit"
          onAction={() => setShowAdd(true)}
        />
      )}

      {active.map((habit, i) => {
        const done = habit.completedDates.includes(today);
        const streak = getHabitStreak(habit);
        const todayEntry = checkInFor(habit, today);
        const restDay = !isScheduledOn(habit, today);
        const target = habit.dailyTarget ?? 1;
        const count = dayCountFor(habit, today);
        return (
          <Animated.View key={habit.id} entering={FadeInDown.delay(Math.min(i, 6) * 50).duration(220)} style={{ marginBottom: 12, opacity: restDay ? 0.55 : 1 }}>
            <GlassPanel variant="medium" borderRadius={22} contentStyle={{ padding: 18 }} style={{ borderColor: done ? habit.color + '55' : colors.glassBorder }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pressable onPress={() => setHeatmapFor(heatmapFor === habit.id ? null : habit.id)}>
                  <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: habit.color + '18', borderWidth: 1, borderColor: habit.color + '33', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    <Text style={{ color: habit.color, fontSize: 13, fontWeight: '800' }}>{habit.marker}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => setDetailId(habit.id)} style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{habit.name}</Text>
                    {habit.reminder ? <Bell color={colors.textMuted} size={12} weight="fill" /> : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Fire color={streak > 0 ? '#B08536' : colors.textMuted} size={13} weight={streak > 0 ? 'fill' : 'regular'} />
                    <Text style={{ color: streak > 0 ? '#B08536' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{streak} day streak</Text>
                    {restDay ? (
                      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>· rest day</Text>
                    ) : habit.weeklyGoal ? (
                      <Text style={{ color: thisWeekCount(habit.completedDates) >= habit.weeklyGoal ? '#4E8B7A' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                        · {Math.min(thisWeekCount(habit.completedDates), habit.weeklyGoal)}/{habit.weeklyGoal} wk
                      </Text>
                    ) : null}
                    {done && todayEntry?.at ? (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>· {formatCheckInTime(todayEntry.at)}</Text>
                    ) : null}
                  </View>
                </Pressable>
                <AnimatedPressable onPress={() => bumpHabit(habit.id)} disabled={restDay} scaleValue={0.85} haptic="medium" style={{ marginLeft: 8 }}>
                  {target > 1 ? (
                    <View style={{
                      minWidth: 44, height: 36, borderRadius: 18, paddingHorizontal: 10,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: done ? habit.color : habit.color + '14',
                      borderWidth: done ? 0 : 1.5,
                      borderColor: count > 0 ? habit.color + '88' : colors.glassBorder,
                    }}>
                      <Text style={{ color: done ? '#fff' : habit.color, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                        {count}/{target}
                      </Text>
                    </View>
                  ) : done ? (
                    <CheckCircle color={habit.color} size={36} weight="fill" />
                  ) : (
                    <CircleDashed color={colors.glassBorder} size={36} weight="regular" />
                  )}
                </AnimatedPressable>
              </View>
              <WeekRow habit={habit} colors={colors} onDayPress={date => setProof({ habitId: habit.id, date })} />
              {heatmapFor === habit.id && <Heatmap habit={habit} colors={colors} />}
              {done && (
                <Pressable onPress={() => setProof({ habitId: habit.id, date: today })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 9, borderRadius: 10, justifyContent: 'center', backgroundColor: habit.color + '12', borderWidth: StyleSheet.hairlineWidth, borderColor: habit.color + '33' }}>
                    <NotePencil color={habit.color} size={14} weight="fill" />
                    <Text style={{ color: habit.color, fontSize: 12.5, fontWeight: '700' }}>
                      {todayEntry?.note || todayEntry?.photoUri ? 'View note & proof' : 'Add note or photo proof'}
                    </Text>
                  </View>
                </Pressable>
              )}
            </GlassPanel>
          </Animated.View>
        );
      })}

      {/* Archived */}
      {archived.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Pressable onPress={() => setShowArchived(v => !v)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Text style={[font.eyebrow, { color: colors.textMuted, flex: 1 }]}>
                Archived · {archived.length}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{showArchived ? 'Hide' : 'Show'}</Text>
            </View>
          </Pressable>
          {showArchived && archived.map(habit => (
            <Pressable key={habit.id} onPress={() => setDetailId(habit.id)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: habit.color + '14', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: habit.color, fontSize: 10.5, fontWeight: '800' }}>{habit.marker}</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 14.5, fontWeight: '600', flex: 1 }} numberOfLines={1}>{habit.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{habit.completedDates.length} total</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {showAdd && <AddHabitModal onSave={saveHabit} onClose={() => setShowAdd(false)} />}
      {editHabit && <AddHabitModal initial={editHabit} onSave={saveHabit} onClose={() => setEditHabit(null)} />}
      {detailHabit && !editHabit && (
        <HabitDetail
          habit={detailHabit}
          onEdit={() => setEditHabit(detailHabit)}
          onToggleArchive={() => toggleArchive(detailHabit.id)}
          onDelete={() => deleteHabit(detailHabit.id)}
          onDayPress={date => setProof({ habitId: detailHabit.id, date })}
          onClose={() => setDetailId(null)}
        />
      )}
      {proof && (() => {
        const habit = habits.find(h => h.id === proof.habitId);
        if (!habit) return null;
        return <ProofModal habit={habit} date={proof.date} onSaved={onProofSaved} onClose={() => setProof(null)} />;
      })()}
    </MiniAppShell>
  );
}
