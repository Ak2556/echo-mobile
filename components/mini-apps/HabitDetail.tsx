import React, { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Archive, CaretLeft, CaretRight, PencilSimple, Trash, X, Clock } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import {
  Habit, bestHabitStreak, completionRate, formatCheckInTime,
  getHabitStreak, isScheduledOn, todayStr,
} from '../../lib/habits';

function monthDays(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

/**
 * Per-habit story: streak stats, a month calendar of completions, and the
 * check-in log (times, notes, photo proof). Edit / archive / delete live here
 * so the main list stays quiet.
 */
export function HabitDetail({ habit, onEdit, onToggleArchive, onDelete, onDayPress, onClose }: {
  habit: Habit;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
  onDayPress: (date: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const today = todayStr();
  const done = new Set(habit.completedDates);
  const cells = monthDays(view.year, view.month);
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const atCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth();

  const stats = [
    { label: 'STREAK', value: `${getHabitStreak(habit)}d` },
    { label: 'BEST', value: `${bestHabitStreak(habit)}d` },
    { label: '30 DAYS', value: `${completionRate(habit, 30)}%` },
    { label: 'TOTAL', value: String(habit.completedDates.length) },
  ];

  const recentLog = [...(habit.log ?? [])]
    .filter(entry => entry.note || entry.photoUri)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);

  const confirmDelete = () => {
    Alert.alert('Delete habit?', 'Its whole history goes with it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: insets.top + 8, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: habit.color + '18', borderWidth: 1, borderColor: habit.color + '33', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: habit.color, fontSize: 12, fontWeight: '800' }}>{habit.marker}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 19, fontFamily: 'Fraunces_600SemiBold' }} numberOfLines={1}>{habit.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
              {habit.dailyTarget && habit.dailyTarget > 1 ? `${habit.dailyTarget}× a day` : 'Daily check'}
              {habit.scheduledDays?.length && habit.scheduledDays.length < 7
                ? ` · ${habit.scheduledDays.length} days a week`
                : ''}
              {habit.archived ? ' · Archived' : ''}
            </Text>
          </View>
          <AnimatedPressable onPress={onEdit} scaleValue={0.9} haptic="light" style={{ padding: 6 }} accessibilityLabel="Edit habit">
            <PencilSimple color={colors.textSecondary} size={19} />
          </AnimatedPressable>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light" style={{ padding: 6 }}>
            <X color={colors.textMuted} size={21} />
          </AnimatedPressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 32, gap: 20 }}>
          {/* Stats */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {stats.map(s => (
              <View key={s.label} style={{ flex: 1, backgroundColor: habit.color + '12', borderRadius: 14, padding: 11, borderWidth: 1, borderColor: habit.color + '26' }}>
                <Text style={{ color: habit.color, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.7 }}>{s.label}</Text>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 2 }}>{s.value}</Text>
              </View>
            ))}
          </View>

          {/* Month calendar */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <AnimatedPressable
                onPress={() => setView(v => (v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 }))}
                scaleValue={0.85} haptic="light" style={{ padding: 6 }}
              >
                <CaretLeft color={colors.text} size={16} weight="bold" />
              </AnimatedPressable>
              <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontSize: 15, fontFamily: 'Fraunces_600SemiBold' }}>
                {monthLabel}
              </Text>
              <AnimatedPressable
                onPress={() => setView(v => (v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 }))}
                scaleValue={0.85} haptic="light"
                style={{ padding: 6, opacity: atCurrentMonth ? 0.25 : 1 }}
                disabled={atCurrentMonth}
              >
                <CaretRight color={colors.text} size={16} weight="bold" />
              </AnimatedPressable>
            </View>

            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <Text key={i} style={{ flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>{d}</Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((date, i) => {
                if (!date) return <View key={`x-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1.15 }} />;
                const isDone = done.has(date);
                const scheduled = isScheduledOn(habit, date);
                const future = date > today;
                const isToday = date === today;
                return (
                  <Pressable
                    key={date}
                    onPress={isDone ? () => onDayPress(date) : undefined}
                    style={{ width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View style={{
                      width: 32, height: 32, borderRadius: 10,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isDone ? habit.color : 'transparent',
                      borderWidth: isToday ? 1.5 : 0,
                      borderColor: habit.color + '88',
                      opacity: !scheduled || future ? 0.28 : 1,
                    }}>
                      <Text style={{
                        color: isDone ? '#fff' : colors.textSecondary,
                        fontSize: 12.5,
                        fontWeight: isDone || isToday ? '700' : '400',
                      }}>
                        {Number(date.slice(-2))}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Check-in log */}
          {recentLog.length > 0 && (
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>
                Notes & proof
              </Text>
              {recentLog.map(entry => (
                <Pressable key={entry.date} onPress={() => onDayPress(entry.date)}>
                  <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                    {entry.photoUri ? (
                      <Image source={{ uri: entry.photoUri }} style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surface }} />
                    ) : (
                      <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: habit.color + '14', alignItems: 'center', justifyContent: 'center' }}>
                        <Clock color={habit.color} size={17} weight="fill" />
                      </View>
                    )}
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600' }}>
                        {new Date(entry.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        <Text style={{ color: colors.textMuted, fontWeight: '400' }}>  {formatCheckInTime(entry.at)}</Text>
                      </Text>
                      {entry.note ? (
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{entry.note}</Text>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <AnimatedPressable
              onPress={onToggleArchive}
              scaleValue={0.96} haptic="light"
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 13 }}
            >
              <Archive color={colors.textSecondary} size={16} />
              <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 14 }}>
                {habit.archived ? 'Unarchive' : 'Archive'}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={confirmDelete}
              scaleValue={0.96} haptic="light"
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderWidth: 1, borderColor: '#EF444455', paddingVertical: 13 }}
            >
              <Trash color="#EF4444" size={16} />
              <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Delete</Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
