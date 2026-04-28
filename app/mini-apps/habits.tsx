import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Plus, CheckCircle, CircleNotch, Fire, Trash, X,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

const HABITS_KEY = 'mini:habits';

interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  completedDates: string[]; // ISO date strings yyyy-mm-dd
  createdAt: string;
}

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#F97316'];
const EMOJIS = ['💧', '🏃', '📚', '🧘', '🥗', '😴', '💊', '✍️', '🎯', '🧹', '🌱', '💪'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;
  const sorted = [...completedDates].sort().reverse();
  const today = todayStr();
  let streak = 0;
  let check = today;
  for (const d of sorted) {
    if (d === check) {
      streak++;
      const prev = new Date(check);
      prev.setDate(prev.getDate() - 1);
      check = prev.toISOString().slice(0, 10);
    } else if (d < check) {
      break;
    }
  }
  return streak;
}

async function loadHabits(): Promise<Habit[]> {
  try { return JSON.parse((await AsyncStorage.getItem(HABITS_KEY)) ?? '[]'); } catch { return []; }
}
function saveHabits(habits: Habit[]) { AsyncStorage.setItem(HABITS_KEY, JSON.stringify(habits)); }

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function WeekRow({ habit }: { habit: Habit }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - 6 + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 10 }}>
      {days.map((dateStr, i) => {
        const done = habit.completedDates.includes(dateStr);
        const isToday = dateStr === todayStr();
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ color: isToday ? habit.color : '#52525B', fontSize: 10, fontWeight: isToday ? '700' : '400' }}>
              {DAYS[new Date(dateStr + 'T12:00:00').getDay()]}
            </Text>
            <View style={{
              width: 28, height: 28, borderRadius: 8,
              backgroundColor: done ? habit.color : 'transparent',
              borderWidth: 1.5,
              borderColor: done ? habit.color : isToday ? habit.color + '55' : '#27272A',
              alignItems: 'center', justifyContent: 'center',
            }}>
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
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [color, setColor] = useState(COLORS[0]);

  const submit = () => {
    if (!name.trim()) { showToast('Enter a habit name', '⚠️'); return; }
    onAdd({
      id: Date.now().toString(),
      name: name.trim(),
      emoji,
      color,
      completedDates: [],
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>New Habit</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light">
            <X color={colors.textMuted} size={22} />
          </AnimatedPressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
          {/* Name */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>HABIT NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Drink water, Exercise…"
              placeholderTextColor={colors.textMuted}
              autoFocus
              style={{
                color: colors.text, fontSize: 16,
                backgroundColor: colors.surface, borderRadius: 14,
                borderWidth: 1, borderColor: colors.border,
                paddingHorizontal: 16, paddingVertical: 14,
              }}
            />
          </View>

          {/* Emoji */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>ICON</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {EMOJIS.map(e => (
                <Pressable key={e} onPress={() => setEmoji(e)}>
                  <View style={{
                    width: 48, height: 48, borderRadius: 14,
                    backgroundColor: emoji === e ? color + '22' : colors.surface,
                    borderWidth: 2, borderColor: emoji === e ? color : colors.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Color */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>COLOR</Text>
            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              {COLORS.map(c => (
                <Pressable key={c} onPress={() => setColor(c)}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18, backgroundColor: c,
                    borderWidth: color === c ? 3 : 0,
                    borderColor: '#fff',
                    transform: [{ scale: color === c ? 1.15 : 1 }],
                  }} />
                </Pressable>
              ))}
            </View>
          </View>

          <AnimatedPressable
            onPress={submit}
            scaleValue={0.96} haptic="medium"
            style={{
              backgroundColor: color, borderRadius: 16, paddingVertical: 16,
              alignItems: 'center',
              shadowColor: color, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Add Habit</Text>
          </AnimatedPressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function HabitsApp() {
  const { colors } = useTheme();
  const router = useRouter();
  const [habits, setHabits] = useState<Habit[]>([]);
  useEffect(() => { loadHabits().then(setHabits); }, []);
  const [showAdd, setShowAdd] = useState(false);
  const today = todayStr();

  const doneToday = habits.filter(h => h.completedDates.includes(today)).length;
  const pct = habits.length > 0 ? Math.round((doneToday / habits.length) * 100) : 0;

  const toggleHabit = (id: string) => {
    const updated = habits.map(h => {
      if (h.id !== id) return h;
      const done = h.completedDates.includes(today);
      return {
        ...h,
        completedDates: done
          ? h.completedDates.filter(d => d !== today)
          : [...h.completedDates, today],
      };
    });
    setHabits(updated);
    saveHabits(updated);
  };

  const addHabit = (h: Habit) => {
    const updated = [h, ...habits];
    setHabits(updated);
    saveHabits(updated);
    showToast(`${h.emoji} ${h.name} added`, '✅');
  };

  const deleteHabit = (id: string) => {
    Alert.alert('Delete habit?', 'Your streak will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          const updated = habits.filter(h => h.id !== id);
          setHabits(updated);
          saveHabits(updated);
        },
      },
    ]);
  };

  const todayLabel = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <AnimatedPressable onPress={() => router.back()} scaleValue={0.88} haptic="light" style={{ marginRight: 12 }}>
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Habits</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{todayLabel}</Text>
        </View>
        <AnimatedPressable onPress={() => setShowAdd(true)} scaleValue={0.88} haptic="medium" style={{
          backgroundColor: '#6366F1', borderRadius: 12, padding: 10,
        }}>
          <Plus color="#fff" size={18} weight="bold" />
        </AnimatedPressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Progress card */}
        {habits.length > 0 && (
          <Animated.View entering={FadeInDown.springify()} style={{
            backgroundColor: colors.surface, borderRadius: 24, padding: 20,
            borderWidth: 1, borderColor: colors.border,
          }}>
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
            {/* Progress bar */}
            <View style={{ height: 8, backgroundColor: colors.bg, borderRadius: 4, overflow: 'hidden' }}>
              <Animated.View style={{ height: '100%', width: `${pct}%`, backgroundColor: '#6366F1', borderRadius: 4 }} />
            </View>
          </Animated.View>
        )}

        {habits.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
            <Fire color={colors.border} size={48} weight="thin" />
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>No habits yet</Text>
            <AnimatedPressable onPress={() => setShowAdd(true)} scaleValue={0.96} haptic="medium" style={{ backgroundColor: '#6366F1', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add your first habit</Text>
            </AnimatedPressable>
          </View>
        )}

        {habits.map((habit, i) => {
          const done = habit.completedDates.includes(today);
          const streak = getStreak(habit.completedDates);
          return (
            <Animated.View key={habit.id} entering={FadeInDown.delay(i * 50).springify()}>
              <View style={{
                backgroundColor: colors.surface, borderRadius: 22, padding: 18,
                borderWidth: 1.5, borderColor: done ? habit.color + '55' : colors.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* Emoji + info */}
                  <View style={{
                    width: 52, height: 52, borderRadius: 16,
                    backgroundColor: habit.color + '18',
                    borderWidth: 1, borderColor: habit.color + '33',
                    alignItems: 'center', justifyContent: 'center', marginRight: 14,
                  }}>
                    <Text style={{ fontSize: 26 }}>{habit.emoji}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{habit.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Fire color={streak > 0 ? '#F59E0B' : colors.textMuted} size={13} weight={streak > 0 ? 'fill' : 'regular'} />
                      <Text style={{ color: streak > 0 ? '#F59E0B' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                        {streak} day streak
                      </Text>
                    </View>
                  </View>

                  {/* Check toggle */}
                  <AnimatedPressable onPress={() => toggleHabit(habit.id)} scaleValue={0.85} haptic="medium" style={{ marginLeft: 8 }}>
                    {done
                      ? <CheckCircle color={habit.color} size={36} weight="fill" />
                      : <CircleNotch color={colors.border} size={36} weight="regular" />}
                  </AnimatedPressable>

                  {/* Delete */}
                  <AnimatedPressable onPress={() => deleteHabit(habit.id)} scaleValue={0.85} haptic="light" style={{ marginLeft: 10 }}>
                    <Trash color={colors.textMuted} size={17} />
                  </AnimatedPressable>
                </View>

                {/* 7-day row */}
                <WeekRow habit={habit} />
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>

      {showAdd && <AddHabitModal onAdd={addHabit} onClose={() => setShowAdd(false)} />}
    </SafeAreaView>
  );
}
