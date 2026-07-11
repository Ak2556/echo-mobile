import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, Alert, Modal, StyleSheet, Image, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Plus, CheckCircle, CircleDashed, Fire, Trash, X, Camera, Images, Clock, NotePencil } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import {
  HABIT_COLORS, HABIT_MARKERS, Habit, HabitCheckIn, checkInFor, formatCheckInTime,
  getStreak, loadHabits, saveHabits, setCheckInDetails, todayStr,
} from '../../lib/habits';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
        return (
          <Pressable key={i} onPress={done ? () => onDayPress(dateStr) : undefined} style={{ flex: 1 }}>
            <View style={{ alignItems: 'center', gap: 4 }}>
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

function AddHabitModal({ onAdd, onClose }: { onAdd: (h: Habit) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const accent = colors.accent;
  const [name, setName] = useState('');
  const [marker, setMarker] = useState(HABIT_MARKERS[0]);
  const [color, setColor] = useState(accent);

  const submit = () => {
    if (!name.trim()) { showToast('Enter a habit name', 'Error'); return; }
    onAdd({ id: Date.now().toString(), name: name.trim(), marker, color, completedDates: [], createdAt: new Date().toISOString() });
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>New Habit</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light"><X color={colors.textMuted} size={22} /></AnimatedPressable>
        </View>
        <View style={{ padding: 20, gap: 24 }}>
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
          <AnimatedPressable onPress={submit} scaleValue={0.96} haptic="medium" style={{ backgroundColor: color, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: color, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Add Habit</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}

export default function HabitsApp() {
  const { colors } = useTheme();
  const accent = colors.accent;
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

  const doneToday = habits.filter(h => h.completedDates.includes(today)).length;
  const pct = habits.length > 0 ? Math.round((doneToday / habits.length) * 100) : 0;

  const toggleHabit = (id: string) => {
    const updated = habits.map(h => {
      if (h.id !== id) return h;
      const done = h.completedDates.includes(today);
      const log = (h.log ?? []).filter(entry => entry.date !== today);
      if (!done) log.push({ date: today, at: new Date().toISOString() });
      return {
        ...h,
        completedDates: done ? h.completedDates.filter(d => d !== today) : [...h.completedDates, today],
        log,
      };
    });
    setHabits(updated); saveHabits(updated);
  };

  const onProofSaved = (updated: Habit) => {
    setHabits(habits.map(h => h.id === updated.id ? updated : h));
  };

  const addHabit = (h: Habit) => {
    const updated = [h, ...habits];
    setHabits(updated); saveHabits(updated);
    showToast(`${h.name} added`, 'Saved');
  };

  const deleteHabit = (id: string) => {
    Alert.alert('Delete habit?', 'Your streak will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { const updated = habits.filter(h => h.id !== id); setHabits(updated); saveHabits(updated); } },
    ]);
  };

  const todayLabel = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const AddBtn = (
    <AnimatedPressable onPress={() => setShowAdd(true)} scaleValue={0.88} haptic="medium" style={{ backgroundColor: accent, borderRadius: 12, padding: 10 }}>
      <Plus color="#fff" size={18} weight="bold" />
    </AnimatedPressable>
  );

  return (
    <MiniAppShell title="Habits" subtitle={todayLabel} headerRight={AddBtn}>
      {/* Progress */}
      {habits.length > 0 && (
        <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: '900' }}>{pct}%</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{doneToday} of {habits.length} done today</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Fire color={pct === 100 ? '#F59E0B' : colors.textMuted} size={36} weight={pct === 100 ? 'fill' : 'thin'} />
              {pct === 100 && <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>Perfect!</Text>}
            </View>
          </View>
          <View style={{ height: 8, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${pct}%`, backgroundColor: accent, borderRadius: 4 }} />
          </View>
        </GlassPanel>
      )}

      {habits.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
          <Fire color={colors.glassBorder} size={48} weight="thin" />
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>No habits yet</Text>
          <AnimatedPressable onPress={() => setShowAdd(true)} scaleValue={0.96} haptic="medium" style={{ backgroundColor: accent, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add your first habit</Text>
          </AnimatedPressable>
        </View>
      )}

      {habits.map((habit, i) => {
        const done = habit.completedDates.includes(today);
        const streak = getStreak(habit.completedDates);
        const todayEntry = checkInFor(habit, today);
        return (
          <Animated.View key={habit.id} entering={FadeInDown.delay(i * 50).duration(220)} style={{ marginBottom: 12 }}>
            <GlassPanel variant="medium" borderRadius={22} contentStyle={{ padding: 18 }} style={{ borderColor: done ? habit.color + '55' : colors.glassBorder }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: habit.color + '18', borderWidth: 1, borderColor: habit.color + '33', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                  <Text style={{ color: habit.color, fontSize: 13, fontWeight: '800' }}>{habit.marker}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{habit.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Fire color={streak > 0 ? '#F59E0B' : colors.textMuted} size={13} weight={streak > 0 ? 'fill' : 'regular'} />
                    <Text style={{ color: streak > 0 ? '#F59E0B' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{streak} day streak</Text>
                    {done && todayEntry?.at ? (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>· {formatCheckInTime(todayEntry.at)}</Text>
                    ) : null}
                  </View>
                </View>
                <AnimatedPressable onPress={() => toggleHabit(habit.id)} scaleValue={0.85} haptic="medium" style={{ marginLeft: 8 }}>
                  {done ? <CheckCircle color={habit.color} size={36} weight="fill" /> : <CircleDashed color={colors.glassBorder} size={36} weight="regular" />}
                </AnimatedPressable>
                <AnimatedPressable onPress={() => deleteHabit(habit.id)} scaleValue={0.85} haptic="light" style={{ marginLeft: 10 }}>
                  <Trash color={colors.textMuted} size={17} />
                </AnimatedPressable>
              </View>
              <WeekRow habit={habit} colors={colors} onDayPress={date => setProof({ habitId: habit.id, date })} />
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

      {showAdd && <AddHabitModal onAdd={addHabit} onClose={() => setShowAdd(false)} />}
      {proof && (() => {
        const habit = habits.find(h => h.id === proof.habitId);
        if (!habit) return null;
        return <ProofModal habit={habit} date={proof.date} onSaved={onProofSaved} onClose={() => setProof(null)} />;
      })()}
    </MiniAppShell>
  );
}
