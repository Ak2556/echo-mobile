import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Keyboard, Modal, ScrollView, Platform } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Bell, BellSlash, CheckCircle, CircleDashed, Flag, Plus, Trash, CalendarBlank, Tag, NotePencil, X, CaretDown, WarningCircle } from 'phosphor-react-native';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniChip, MiniCommandDeck, MiniEmptyState } from '../../components/mini-apps/MiniKit';
import { useTheme } from '../../lib/theme';
import { useI18n } from '../../lib/i18n';
import { showToast } from '../../components/ui/Toast';
import {
  TaskItem, TaskPriority, SubTask, loadTasks, saveTasks, taskStats,
  todayTaskDate, tomorrowTaskDate,
} from '../../lib/tasks';
import { scheduleTaskReminder, cancelTaskReminder } from '../../lib/taskReminders';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, Layout } from 'react-native-reanimated';

type Filter = 'any' | 'today' | 'upcoming' | 'someday';

const TIME_OPTIONS = [
  { label: 'Morning', value: '09:00' },
  { label: 'Noon', value: '12:00' },
  { label: 'Evening', value: '18:00' },
  { label: 'Night', value: '21:00' },
];

function formatTaskTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const PRIORITIES: { id: TaskPriority; label: string; color: string }[] = [
  { id: 'normal', label: 'Normal', color: '#4E7A8B' },
  { id: 'high', label: 'High', color: '#D97745' },
  { id: 'urgent', label: 'Urgent', color: '#D94545' },
  { id: 'low', label: 'Low', color: '#4E8B7A' },
];

const DUE_OPTIONS = [
  { label: 'No due', value: undefined },
  { label: 'Today', value: todayTaskDate() },
  { label: 'Tomorrow', value: tomorrowTaskDate() },
];

export default function TasksScreen() {
  const { colors } = useTheme();
  const { tt } = useI18n();
  const accent = '#5E748B'; 
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [due, setDue] = useState<string | undefined>(todayTaskDate());
  const [time, setTime] = useState<string | undefined>(undefined);
  const [remind, setRemind] = useState(false);
  const [filter, setFilter] = useState<Filter>('today');
  const { vAction, vValue } = useLocalSearchParams<{ vAction?: string; vValue?: string }>();
  const didVoiceRef = React.useRef(false);
  
  // Detail Modal State
  const [detailTask, setDetailTask] = useState<TaskItem | null>(null);
  const [detailNotes, setDetailNotes] = useState('');
  const [detailTags, setDetailTags] = useState('');
  const [detailSubtask, setDetailSubtask] = useState('');

  useFocusEffect(React.useCallback(() => {
    loadTasks().then((loaded) => {
      const a = typeof vAction === 'string' ? vAction.toLowerCase() : '';
      const text = typeof vValue === 'string' ? vValue.trim() : '';
      if (!didVoiceRef.current && a === 'add' && text) {
        didVoiceRef.current = true;
        const now = new Date().toISOString();
        const base: TaskItem = { id: `${Date.now()}`, title: text, done: false, priority: 'normal', due: todayTaskDate(), createdAt: now, updatedAt: now };
        const next = [base, ...loaded];
        setTasks(next);
        void saveTasks(next);
      } else {
        setTasks(loaded);
      }
    }).catch(() => setTasks([]));
  }, [vAction, vValue]));

  const stats = taskStats(tasks);
  
  const todayDate = todayTaskDate();
  
  const visible = useMemo(() => {
    let filtered = tasks.filter(task => !task.done);
    if (filter === 'today') filtered = filtered.filter(task => task.due === todayDate);
    else if (filter === 'upcoming') filtered = filtered.filter(task => task.due && task.due > todayDate);
    else if (filter === 'someday') filtered = filtered.filter(task => !task.due);
    return filtered;
  }, [filter, tasks, todayDate]);

  const update = (next: TaskItem[]) => {
    setTasks(next);
    void saveTasks(next);
  };

  const add = async () => {
    const clean = title.trim();
    if (!clean) return;
    const now = new Date().toISOString();
    const effectiveDue = remind && !due ? todayTaskDate() : due;
    const base: TaskItem = {
      id: `${Date.now()}`,
      title: clean,
      notes: notes.trim() || undefined,
      due: effectiveDue,
      time: effectiveDue ? time : undefined,
      done: false,
      priority,
      createdAt: now,
      updatedAt: now,
      subtasks: [],
      tags: [],
    };
    const reminderId = remind ? (await scheduleTaskReminder(base)) ?? undefined : undefined;
    update([{ ...base, reminderId }, ...tasks]);
    setTitle('');
    setNotes('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Keyboard.dismiss();
    showToast(reminderId ? tt('Task added · reminder set') : tt('Task added'), tt('Tasks'));
  };

  const toggle = (task: TaskItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const done = !task.done;
    if (done) void cancelTaskReminder(task.reminderId);
    update(tasks.map(item => item.id === task.id
      ? { ...item, done, reminderId: done ? undefined : item.reminderId, updatedAt: new Date().toISOString() }
      : item));
  };

  const remove = (task: TaskItem) => {
    void cancelTaskReminder(task.reminderId);
    update(tasks.filter(item => item.id !== task.id));
  };

  const openDetail = (task: TaskItem) => {
    setDetailTask(task);
    setDetailNotes(task.notes || '');
    setDetailTags((task.tags || []).join(', '));
  };

  const closeDetail = () => {
    if (detailTask) {
      updateTask(detailTask.id, {
        notes: detailNotes.trim() || undefined,
        tags: detailTags.split(',').map(t => t.trim()).filter(t => t.length > 0)
      });
    }
    setDetailTask(null);
  };

  const updateTask = (id: string, partial: Partial<TaskItem>) => {
    update(tasks.map(item => item.id === id ? { ...item, ...partial, updatedAt: new Date().toISOString() } : item));
    if (detailTask && detailTask.id === id) {
      setDetailTask({ ...detailTask, ...partial, updatedAt: new Date().toISOString() });
    }
  };

  const addSubtask = () => {
    if (!detailTask || !detailSubtask.trim()) return;
    const st: SubTask = { id: `${Date.now()}`, title: detailSubtask.trim(), done: false };
    updateTask(detailTask.id, { subtasks: [...(detailTask.subtasks || []), st] });
    setDetailSubtask('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleSubtask = (stId: string) => {
    if (!detailTask) return;
    const updated = (detailTask.subtasks || []).map(st => st.id === stId ? { ...st, done: !st.done } : st);
    updateTask(detailTask.id, { subtasks: updated });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const deleteSubtask = (stId: string) => {
    if (!detailTask) return;
    const updated = (detailTask.subtasks || []).filter(st => st.id !== stId);
    updateTask(detailTask.id, { subtasks: updated });
  };

  return (
    <MiniAppShell title={tt('Tasks')} subtitle={tt('Action')}>
      <MiniCommandDeck
        accent={accent}
        title={tt('Your execution queue')}
        subtitle={tt('Priorities, dates, action.')}
        metrics={[
          { label: tt('Open'), value: `${stats.open}`, detail: tt('active') },
          { label: tt('Today'), value: `${stats.dueToday}`, detail: tt('due now') },
          { label: tt('High'), value: `${stats.high}`, detail: tt('priority') },
        ]}
        chips={[tt('Plan next 3'), tt('Share progress'), tt('Break blockers')]}
      />
      <GlassPanel variant="light" borderRadius={22} contentStyle={{ padding: 16, gap: 12 }} style={{ marginBottom: 16 }}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={tt('Add a task...')}
          placeholderTextColor={colors.textMuted}
          style={{ color: colors.text, fontSize: 17, fontWeight: '700', paddingVertical: 8 }}
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PRIORITIES.map(item => (
            <Pressable key={item.id} onPress={() => setPriority(item.id)}>
              <View style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: priority === item.id ? item.color : colors.surfaceHover }}>
                <Text style={{ color: priority === item.id ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{tt(item.label)}</Text>
              </View>
            </Pressable>
          ))}
          {DUE_OPTIONS.map(item => (
            <Pressable key={item.label} onPress={() => setDue(item.value)}>
              <View style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: due === item.value ? accent : colors.surfaceHover }}>
                <Text style={{ color: due === item.value ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{tt(item.label)}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {TIME_OPTIONS.map(item => {
            const active = time === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => { const next = active ? undefined : item.value; setTime(next); if (next) setRemind(true); }}
              >
                <View style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: active ? accent : colors.surfaceHover }}>
                  <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{tt(item.label)}</Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setRemind(v => !v)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: remind ? `${accent}` : colors.surfaceHover }}>
              {remind ? <Bell color="#fff" size={13} weight="fill" /> : <BellSlash color={colors.textSecondary} size={13} />}
              <Text style={{ color: remind ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{remind ? tt('Reminder on') : tt('Remind me')}</Text>
            </View>
          </Pressable>
        </View>

        <Pressable onPress={add}>
          <View style={{ height: 48, borderRadius: 16, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            <Plus color="#fff" size={18} weight="bold" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>{tt('Add task')}</Text>
          </View>
        </Pressable>
      </GlassPanel>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14, paddingHorizontal: 4 }}>
        {(['today', 'upcoming', 'someday', 'any'] as Filter[]).map(item => (
          <MiniChip
            key={item}
            accent={accent}
            label={tt(item === 'any' ? 'Any Time' : item.charAt(0).toUpperCase() + item.slice(1))}
            active={filter === item}
            onPress={() => {
              Haptics.selectionAsync();
              setFilter(item);
            }}
          />
        ))}
      </ScrollView>

      <View style={{ gap: 10 }}>
        {visible.map(task => {
          const priorityMeta = PRIORITIES.find(item => item.id === task.priority) ?? PRIORITIES[0];
          return (
            <Animated.View key={task.id} entering={FadeIn} exiting={FadeOut} layout={Layout.springify()}>
              <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14 }}>
                <Pressable onPress={() => openDetail(task)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable onPress={() => toggle(task)} hitSlop={8}>
                    {task.done ? <CheckCircle color={accent} size={24} weight="fill" /> : <CircleDashed color={colors.textMuted} size={24} />}
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: task.done ? colors.textMuted : colors.text, fontSize: 15, fontWeight: '800', textDecorationLine: task.done ? 'line-through' : 'none' }} numberOfLines={1}>
                      {task.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                      {task.reminderId && !task.done && <Bell color={accent} size={12} weight="fill" />}
                      {task.priority === 'urgent' && <WarningCircle color={priorityMeta.color} size={12} weight="bold" />}
                      <Text style={{ color: task.priority === 'urgent' ? priorityMeta.color : colors.textMuted, fontSize: 12, fontWeight: task.priority === 'urgent' ? '700' : '500' }}>
                        {task.due ? new Date(`${task.due}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }) : tt('No due date')}
                      </Text>
                      {task.time && <Text style={{ color: colors.textMuted, fontSize: 12 }}>· {formatTaskTime(task.time)}</Text>}
                      {task.subtasks && task.subtasks.length > 0 && (
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>· {task.subtasks.filter(s => s.done).length}/{task.subtasks.length} steps</Text>
                      )}
                      {task.tags && task.tags.length > 0 && (
                        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>·</Text>
                          {task.tags.slice(0, 2).map((t, i) => (
                            <Text key={i} style={{ color: accent, fontSize: 11, fontWeight: '700' }}>#{t}</Text>
                          ))}
                          {task.tags.length > 2 && <Text style={{ color: colors.textMuted, fontSize: 11 }}>+{task.tags.length - 2}</Text>}
                        </View>
                      )}
                    </View>
                  </View>
                  <Flag color={priorityMeta.color} size={17} weight={task.priority === 'low' ? 'regular' : 'fill'} />
                  <Pressable onPress={() => remove(task)} hitSlop={8}>
                    <Trash color={colors.textMuted} size={17} />
                  </Pressable>
                </Pressable>
              </GlassPanel>
            </Animated.View>
          );
        })}
        {visible.length === 0 && (
          <MiniEmptyState
            accent={accent}
            icon={<CheckCircle color={colors.textMuted} size={40} weight="duotone" />}
            title={tt('Nothing here')}
            subtitle={tt('Add the next task that actually moves something forward.')}
          />
        )}
      </View>

      <EdgeFeaturePanel
        appId="tasks"
        appName="Tasks"
        accent={accent}
        headline={tt('Turn intent into next actions')}
        caption={tt('Keep the next step visible, then share progress or ask Echo to break down blockers.')}
        metrics={[
          { label: tt('Open'), value: `${stats.open}` },
          { label: tt('Due today'), value: `${stats.dueToday}` },
          { label: tt('High priority'), value: `${stats.high}` },
        ]}
        prompt="Review my open tasks and help me pick the next 3 actions for today."
        shareText={`Tasks: ${stats.open} open, ${stats.dueToday} due today, ${stats.high} high priority.`}
        publishTitle="Task progress"
        publishBody={`I have ${stats.open} open tasks and ${stats.dueToday} due today.`}
      />

      {/* Detail Modal */}
      <Modal visible={!!detailTask} animationType="slide" transparent={true} onRequestClose={closeDetail}>
        {detailTask && (
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} onPress={closeDetail} />
            <Animated.View entering={SlideInDown} exiting={SlideOutDown} style={{ backgroundColor: colors.background, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 24, maxHeight: '90%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{detailTask.title}</Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>Created {new Date(detailTask.createdAt).toLocaleDateString()}</Text>
                </View>
                <Pressable onPress={closeDetail} style={{ backgroundColor: colors.surfaceHover, padding: 8, borderRadius: 16 }}>
                  <X color={colors.text} size={20} weight="bold" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 24 }}>
                {/* Notes */}
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <NotePencil color={accent} size={18} weight="fill" />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Notes</Text>
                  </View>
                  <TextInput
                    value={detailNotes}
                    onChangeText={setDetailNotes}
                    placeholder="Add details..."
                    placeholderTextColor={colors.textMuted}
                    style={{ backgroundColor: colors.surfaceHover, color: colors.text, padding: 16, borderRadius: 16, fontSize: 15, minHeight: 80 }}
                    multiline
                  />
                </View>

                {/* Properties (Priority, Due Date) */}
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Properties</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {PRIORITIES.map(p => (
                      <Pressable key={p.id} onPress={() => updateTask(detailTask.id, { priority: p.id })}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: detailTask.priority === p.id ? p.color : colors.surfaceHover, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 }}>
                          <Flag color={detailTask.priority === p.id ? '#fff' : p.color} size={14} weight="fill" />
                          <Text style={{ color: detailTask.priority === p.id ? '#fff' : colors.textSecondary, fontSize: 13, fontWeight: '700' }}>{p.label}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
                
                {/* Due Date & Reminders */}
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Schedule</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {DUE_OPTIONS.map(d => (
                      <Pressable key={d.label} onPress={() => updateTask(detailTask.id, { due: d.value })}>
                        <View style={{ backgroundColor: detailTask.due === d.value ? accent : colors.surfaceHover, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 }}>
                          <Text style={{ color: detailTask.due === d.value ? '#fff' : colors.textSecondary, fontSize: 13, fontWeight: '700' }}>{d.label}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Subtasks */}
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <CheckCircle color={accent} size={18} weight="fill" />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Subtasks</Text>
                  </View>
                  <View style={{ gap: 8 }}>
                    {detailTask.subtasks?.map(st => (
                      <Animated.View key={st.id} entering={FadeIn} layout={Layout.springify()} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceHover, padding: 12, borderRadius: 12 }}>
                        <Pressable onPress={() => toggleSubtask(st.id)}>
                          {st.done ? <CheckCircle color={accent} size={20} weight="fill" /> : <CircleDashed color={colors.textMuted} size={20} />}
                        </Pressable>
                        <Text style={{ flex: 1, color: st.done ? colors.textMuted : colors.text, fontSize: 15, textDecorationLine: st.done ? 'line-through' : 'none' }}>
                          {st.title}
                        </Text>
                        <Pressable onPress={() => deleteSubtask(st.id)}>
                          <X color={colors.textMuted} size={16} />
                        </Pressable>
                      </Animated.View>
                    ))}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <TextInput
                        value={detailSubtask}
                        onChangeText={setDetailSubtask}
                        placeholder="Add subtask..."
                        placeholderTextColor={colors.textMuted}
                        style={{ flex: 1, backgroundColor: colors.surfaceHover, color: colors.text, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, fontSize: 15 }}
                        onSubmitEditing={addSubtask}
                      />
                      <Pressable onPress={addSubtask} style={{ backgroundColor: accent, padding: 12, borderRadius: 12 }}>
                        <Plus color="#fff" size={16} weight="bold" />
                      </Pressable>
                    </View>
                  </View>
                </View>

                {/* Tags */}
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Tag color={accent} size={18} weight="fill" />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Tags (comma separated)</Text>
                  </View>
                  <TextInput
                    value={detailTags}
                    onChangeText={setDetailTags}
                    placeholder="work, personal, grocery"
                    placeholderTextColor={colors.textMuted}
                    style={{ backgroundColor: colors.surfaceHover, color: colors.text, padding: 16, borderRadius: 16, fontSize: 15 }}
                  />
                </View>

              </ScrollView>
            </Animated.View>
          </View>
        )}
      </Modal>
    </MiniAppShell>
  );
}
