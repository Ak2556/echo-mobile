import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, Alert, Modal, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { Plus, CheckCircle, CircleDashed, Fire, Trash, X } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import { HABIT_COLORS, HABIT_EMOJIS, Habit, getStreak, loadHabits, saveHabits, todayStr } from '../../lib/habits';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function WeekRow({ habit, colors }: { habit: Habit; colors: any }) {
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
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ color: isToday ? habit.color : colors.textMuted, fontSize: 10, fontWeight: isToday ? '700' : '400' }}>
              {DAYS[new Date(dateStr + 'T12:00:00').getDay()]}
            </Text>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: done ? habit.color : 'transparent', borderWidth: 1.5, borderColor: done ? habit.color : isToday ? habit.color + '55' : colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
              {done && <CheckCircle color="#fff" size={14} weight="fill" />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function AddHabitModal({ onAdd, onClose }: { onAdd: (h: Habit) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const accent = colors.accent;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(HABIT_EMOJIS[0]);
  const [color, setColor] = useState(accent);

  const submit = () => {
    if (!name.trim()) { showToast('Enter a habit name', '⚠️'); return; }
    onAdd({ id: Date.now().toString(), name: name.trim(), emoji, color, completedDates: [], createdAt: new Date().toISOString() });
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
              {HABIT_EMOJIS.map(e => (
                <Pressable key={e} onPress={() => setEmoji(e)}>
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: emoji === e ? color + '22' : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: emoji === e ? 2 : StyleSheet.hairlineWidth, borderColor: emoji === e ? color : colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
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
  const today = todayStr();

  const doneToday = habits.filter(h => h.completedDates.includes(today)).length;
  const pct = habits.length > 0 ? Math.round((doneToday / habits.length) * 100) : 0;

  const toggleHabit = (id: string) => {
    const updated = habits.map(h => {
      if (h.id !== id) return h;
      const done = h.completedDates.includes(today);
      return { ...h, completedDates: done ? h.completedDates.filter(d => d !== today) : [...h.completedDates, today] };
    });
    setHabits(updated); saveHabits(updated);
  };

  const addHabit = (h: Habit) => {
    const updated = [h, ...habits];
    setHabits(updated); saveHabits(updated);
    showToast(`${h.emoji} ${h.name} added`, '✅');
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
        return (
          <Animated.View key={habit.id} entering={FadeInDown.delay(i * 50).springify()} style={{ marginBottom: 12 }}>
            <GlassPanel variant="medium" borderRadius={22} contentStyle={{ padding: 18 }} style={{ borderColor: done ? habit.color + '55' : colors.glassBorder }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: habit.color + '18', borderWidth: 1, borderColor: habit.color + '33', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                  <Text style={{ fontSize: 26 }}>{habit.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{habit.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Fire color={streak > 0 ? '#F59E0B' : colors.textMuted} size={13} weight={streak > 0 ? 'fill' : 'regular'} />
                    <Text style={{ color: streak > 0 ? '#F59E0B' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{streak} day streak</Text>
                  </View>
                </View>
                <AnimatedPressable onPress={() => toggleHabit(habit.id)} scaleValue={0.85} haptic="medium" style={{ marginLeft: 8 }}>
                  {done ? <CheckCircle color={habit.color} size={36} weight="fill" /> : <CircleDashed color={colors.glassBorder} size={36} weight="regular" />}
                </AnimatedPressable>
                <AnimatedPressable onPress={() => deleteHabit(habit.id)} scaleValue={0.85} haptic="light" style={{ marginLeft: 10 }}>
                  <Trash color={colors.textMuted} size={17} />
                </AnimatedPressable>
              </View>
              <WeekRow habit={habit} colors={colors} />
            </GlassPanel>
          </Animated.View>
        );
      })}

      {showAdd && <AddHabitModal onAdd={addHabit} onClose={() => setShowAdd(false)} />}
    </MiniAppShell>
  );
}
