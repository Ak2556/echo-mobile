import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Keyboard, Modal, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
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
import { DateTimePicker } from '../../components/ui/DateTimePicker';

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

function formatAlarmTime(alarm: { hour: number; minute: number }): string {
  const ampm = alarm.hour < 12 ? 'AM' : 'PM';
  const h12 = alarm.hour % 12 === 0 ? 12 : alarm.hour % 12;
  return `${h12}:${String(alarm.minute).padStart(2, '0')} ${ampm}`;
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
  const [alarmTime, setAlarmTime] = useState<{ hour: number, minute: number } | null>(null);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [filter, setFilter] = useState<Filter>('today');
  const { vAction, vValue } = useLocalSearchParams<{ vAction?: string; vValue?: string }>();
  const didVoiceRef = React.useRef(false);
  
  // Detail Modal State
  const [detailTask, setDetailTask] = useState<TaskItem | null>(null);
  const [detailNotes, setDetailNotes] = useState('');
  const [detailTags, setDetailTags] = useState('');
  const [detailSubtask, setDetailSubtask] = useState('');
  const [detailAlarm, setDetailAlarm] = useState<{ hour: number, minute: number } | null>(null);
  const [showAlarmPicker, setShowAlarmPicker] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);

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
    const effectiveDue = due;
    const base: TaskItem = {
      id: `${Date.now()}`,
      title: clean,
      notes: notes.trim() || undefined,
      due: effectiveDue,
      alarmTime: alarmTime || undefined,
      done: false,
      priority,
      createdAt: now,
      updatedAt: now,
      subtasks: [],
      tags: [],
    };
    const reminderId = alarmTime ? (await scheduleTaskReminder(base)) ?? undefined : undefined;
    update([{ ...base, reminderId }, ...tasks]);
    setTitle('');
    setNotes('');
    setDue(todayTaskDate());
    setAlarmTime(null);
    setShowAddPicker(false);
    setShowAddSheet(false);
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
    setDetailAlarm(task.alarmTime || null);
    setShowAlarmPicker(false);
  };

  const closeDetail = async () => {
    if (detailTask) {
      const partial: Partial<TaskItem> = {
        notes: detailNotes.trim() || undefined,
        tags: detailTags.split(',').map(t => t.trim()).filter(t => t.length > 0),
        alarmTime: detailAlarm
      };
      
      const updated = { ...detailTask, ...partial };
      
      if (detailAlarm && (!detailTask.alarmTime || detailTask.alarmTime.hour !== detailAlarm.hour || detailTask.alarmTime.minute !== detailAlarm.minute || detailTask.due !== detailNotes)) {
         updated.reminderId = await scheduleTaskReminder(updated as TaskItem) ?? undefined;
         partial.reminderId = updated.reminderId;
      } else if (!detailAlarm && detailTask.alarmTime) {
         void cancelTaskReminder(detailTask.reminderId);
         partial.reminderId = undefined;
      }
      
      updateTask(detailTask.id, partial);
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
    <View style={{ flex: 1, backgroundColor: '#000' }}>
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
            <Animated.View entering={SlideInDown} exiting={SlideOutDown} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 24, maxHeight: '90%' }}>
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
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Schedule & Alarm</Text>

                  
                  <View style={{ backgroundColor: colors.surfaceHover, borderRadius: 16, padding: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Bell color={detailAlarm ? accent : colors.textMuted} size={18} weight={detailAlarm ? "fill" : "regular"} />
                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Task Schedule</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {detailAlarm && (
                          <Pressable onPress={() => { setDetailAlarm(null); setShowAlarmPicker(false); updateTask(detailTask.id, { due: undefined }); }} style={{ padding: 6, backgroundColor: colors.surface, borderRadius: 8 }}>
                            <Trash color={colors.textMuted} size={16} />
                          </Pressable>
                        )}
                        <Pressable onPress={() => {
                          if (!detailAlarm) {
                            setDetailAlarm({ hour: 9, minute: 0 });
                            if (!detailTask.due) updateTask(detailTask.id, { due: todayTaskDate() });
                          }
                          setShowAlarmPicker(!showAlarmPicker);
                        }} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: detailAlarm ? accent : colors.surface, borderRadius: 8 }}>
                          <Text style={{ color: detailAlarm ? '#fff' : colors.text, fontWeight: '700' }}>
                            {detailAlarm ? `${detailAlarm.hour % 12 === 0 ? 12 : detailAlarm.hour % 12}:${detailAlarm.minute.toString().padStart(2, '0')} ${detailAlarm.hour >= 12 ? 'PM' : 'AM'}` : 'Set'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    </View>
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

      {/* Premium Alarm Picker Modal */}
      <Modal visible={showAlarmPicker} animationType="fade" transparent={true} onRequestClose={() => setShowAlarmPicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowAlarmPicker(false)} />
          <Animated.View entering={SlideInDown.duration(300).springify()} exiting={SlideOutDown.duration(200)} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>Set Alarm</Text>
              <Pressable onPress={() => setShowAlarmPicker(false)} style={{ backgroundColor: colors.surfaceHover, padding: 8, borderRadius: 16 }}>
                <X color={colors.text} size={20} weight="bold" />
              </Pressable>
            </View>
            
            <View style={{ backgroundColor: colors.surface, borderRadius: 28, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.glassBorder, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }}>
              {detailAlarm && detailTask && (
                <DateTimePicker 
                  value={{ date: detailTask.due || todayTaskDate(), hour: detailAlarm.hour, minute: detailAlarm.minute }} 
                  onChange={(val) => {
                    updateTask(detailTask.id, { due: val.date });
                    setDetailAlarm({ hour: val.hour, minute: val.minute });
                  }} 
                />
              )}
            </View>
            
            <Pressable 
              onPress={() => setShowAlarmPicker(false)}
              style={({ pressed }) => ({ 
                backgroundColor: accent, 
                paddingVertical: 18, 
                borderRadius: 20, 
                alignItems: 'center',
                opacity: pressed ? 0.8 : 1,
                shadowColor: accent,
                shadowOpacity: 0.3,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 }
              })}
            >
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Save Alarm</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

    </MiniAppShell>
    
    {/* FAB */}
    <Pressable 
      onPress={() => setShowAddSheet(true)}
      style={{ position: 'absolute', bottom: 40, right: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: accent, justifyContent: 'center', alignItems: 'center', shadowColor: accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10 }}
    >
      <Plus color="#fff" size={28} weight="bold" />
    </Pressable>

    {/* Bottom Sheet */}
    {showAddSheet && (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowAddSheet(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}>
          <Animated.View entering={SlideInDown.springify().damping(18).stiffness(200)} exiting={SlideOutDown} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.2, shadowRadius: 20, maxHeight: '90%' }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 }} />
          
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={tt('What needs to be done?')}
            placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 24 }}
            returnKeyType="done"
            onSubmitEditing={() => { add(); setShowAddSheet(false); }}
          />
          
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tt('Priority')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {PRIORITIES.map(item => (
              <Pressable key={item.id} onPress={() => setPriority(item.id)}>
                <View style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: priority === item.id ? item.color : colors.surfaceHover, borderWidth: priority === item.id ? 0 : 1, borderColor: colors.border }}>
                  <Text style={{ color: priority === item.id ? '#fff' : colors.textSecondary, fontSize: 14, fontWeight: '800' }}>{tt(item.label)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tt('Schedule & Alarm')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: showAddPicker ? 16 : 32 }}>
            <Pressable onPress={() => {
              if (!showAddPicker && !alarmTime) {
                setAlarmTime({ hour: 9, minute: 0 });
                setDue(todayTaskDate());
              }
              setShowAddPicker(!showAddPicker);
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: alarmTime ? accent : colors.surfaceHover, borderWidth: alarmTime ? 0 : 1, borderColor: colors.border }}>
                <Bell color={alarmTime ? '#fff' : colors.textSecondary} size={16} weight={alarmTime ? "fill" : "regular"} />
                <Text style={{ color: alarmTime ? '#fff' : colors.textSecondary, fontSize: 14, fontWeight: '800' }}>
                  {alarmTime ? `Scheduled: ${formatAlarmTime(alarmTime)}` : tt('Set Schedule...')}
                </Text>
              </View>
            </Pressable>
            {alarmTime && (
              <Pressable onPress={() => { setAlarmTime(null); setShowAddPicker(false); }}>
                <View style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.border }}>
                  <X color={colors.textSecondary} size={16} weight="bold" />
                </View>
              </Pressable>
            )}
          </View>

          {showAddPicker && alarmTime && due && (
            <View style={{ marginVertical: 8, marginBottom: 32 }}>
              <DateTimePicker 
                value={{ date: due, hour: alarmTime.hour, minute: alarmTime.minute }} 
                onChange={(val) => {
                  setDue(val.date);
                  setAlarmTime({ hour: val.hour, minute: val.minute });
                }} 
              />
            </View>
          )}

          <Pressable onPress={() => { add(); setShowAddSheet(false); }}>
            <View style={{ height: 56, borderRadius: 20, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, shadowColor: accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}>
              <Plus color="#fff" size={20} weight="bold" />
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>{tt('Create Task')}</Text>
            </View>
          </Pressable>
          
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    )}
    </View>
  );
}
