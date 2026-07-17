import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CheckCircle, CircleDashed, Flag, Plus, Trash } from 'phosphor-react-native';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniChip, MiniEmptyState } from '../../components/mini-apps/MiniKit';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import {
  TaskItem, TaskPriority, loadTasks, saveTasks, taskStats,
  todayTaskDate, tomorrowTaskDate,
} from '../../lib/tasks';

type Filter = 'open' | 'today' | 'high' | 'done';

const PRIORITIES: { id: TaskPriority; label: string; color: string }[] = [
  { id: 'normal', label: 'Normal', color: '#4E7A8B' },
  { id: 'high', label: 'High', color: '#D97745' },
  { id: 'low', label: 'Low', color: '#4E8B7A' },
];

const DUE_OPTIONS = [
  { label: 'No due', value: undefined },
  { label: 'Today', value: todayTaskDate() },
  { label: 'Tomorrow', value: tomorrowTaskDate() },
];

export default function TasksScreen() {
  const { colors } = useTheme();
  const accent = '#5E748B'; // dusk — warm editorial palette
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [due, setDue] = useState<string | undefined>(todayTaskDate());
  const [filter, setFilter] = useState<Filter>('open');

  useFocusEffect(React.useCallback(() => {
    loadTasks().then(setTasks).catch(() => setTasks([]));
  }, []));

  const stats = taskStats(tasks);
  const visible = useMemo(() => {
    const today = todayTaskDate();
    if (filter === 'today') return tasks.filter(task => !task.done && task.due === today);
    if (filter === 'high') return tasks.filter(task => !task.done && task.priority === 'high');
    if (filter === 'done') return tasks.filter(task => task.done);
    return tasks.filter(task => !task.done);
  }, [filter, tasks]);

  const update = (next: TaskItem[]) => {
    setTasks(next);
    void saveTasks(next);
  };

  const add = () => {
    const clean = title.trim();
    if (!clean) return;
    const now = new Date().toISOString();
    update([{
      id: `${Date.now()}`,
      title: clean,
      notes: notes.trim() || undefined,
      due,
      done: false,
      priority,
      createdAt: now,
      updatedAt: now,
    }, ...tasks]);
    setTitle('');
    setNotes('');
    showToast('Task added', 'Tasks');
  };

  const toggle = (task: TaskItem) => {
    update(tasks.map(item => item.id === task.id ? { ...item, done: !item.done, updatedAt: new Date().toISOString() } : item));
  };

  const remove = (task: TaskItem) => {
    update(tasks.filter(item => item.id !== task.id));
  };

  return (
    <MiniAppShell title="Tasks" subtitle={`${stats.open} open · ${stats.dueToday} due today`}>
      <GlassPanel variant="light" borderRadius={22} contentStyle={{ padding: 16, gap: 12 }} style={{ marginBottom: 16 }}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Add a task..."
          placeholderTextColor={colors.textMuted}
          style={{ color: colors.text, fontSize: 17, fontWeight: '700', paddingVertical: 8 }}
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional note"
          placeholderTextColor={colors.textMuted}
          style={{ color: colors.textSecondary, fontSize: 13, paddingVertical: 4 }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PRIORITIES.map(item => (
            <Pressable key={item.id} onPress={() => setPriority(item.id)}>
              <View style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: priority === item.id ? item.color : colors.surfaceHover }}>
                <Text style={{ color: priority === item.id ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{item.label}</Text>
              </View>
            </Pressable>
          ))}
          {DUE_OPTIONS.map(item => (
            <Pressable key={item.label} onPress={() => setDue(item.value)}>
              <View style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: due === item.value ? accent : colors.surfaceHover }}>
                <Text style={{ color: due === item.value ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{item.label}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={add}>
          <View style={{ height: 48, borderRadius: 16, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            <Plus color="#fff" size={18} weight="bold" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>Add task</Text>
          </View>
        </Pressable>
      </GlassPanel>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {(['open', 'today', 'high', 'done'] as Filter[]).map(item => (
          <MiniChip
            key={item}
            accent={accent}
            label={item.charAt(0).toUpperCase() + item.slice(1)}
            active={filter === item}
            onPress={() => setFilter(item)}
          />
        ))}
      </View>

      <View style={{ gap: 10 }}>
        {visible.map(task => {
          const priorityMeta = PRIORITIES.find(item => item.id === task.priority) ?? PRIORITIES[0];
          return (
            <GlassPanel key={task.id} variant="light" borderRadius={18} contentStyle={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable onPress={() => toggle(task)} hitSlop={8}>
                  {task.done ? <CheckCircle color={accent} size={24} weight="fill" /> : <CircleDashed color={colors.textMuted} size={24} />}
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: task.done ? colors.textMuted : colors.text, fontSize: 15, fontWeight: '800', textDecorationLine: task.done ? 'line-through' : 'none' }} numberOfLines={1}>
                    {task.title}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                    {task.due ? new Date(`${task.due}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'No due date'}
                    {task.notes ? ` · ${task.notes}` : ''}
                  </Text>
                </View>
                <Flag color={priorityMeta.color} size={17} weight={task.priority === 'low' ? 'regular' : 'fill'} />
                <Pressable onPress={() => remove(task)} hitSlop={8}>
                  <Trash color={colors.textMuted} size={17} />
                </Pressable>
              </View>
            </GlassPanel>
          );
        })}
        {visible.length === 0 && (
          <MiniEmptyState
            accent={accent}
            icon={<CheckCircle color={colors.textMuted} size={40} weight="thin" />}
            title="Nothing here"
            subtitle="Change filters or add your next task."
          />
        )}
      </View>

      <EdgeFeaturePanel
        appId="tasks"
        appName="Tasks"
        accent={accent}
        headline="Turn intent into next actions"
        caption="Keep the next step visible, then share progress or ask Echo to break down blockers."
        metrics={[
          { label: 'Open', value: `${stats.open}` },
          { label: 'Due today', value: `${stats.dueToday}` },
          { label: 'High priority', value: `${stats.high}` },
        ]}
        prompt="Review my open tasks and help me pick the next 3 actions for today."
        shareText={`Tasks: ${stats.open} open, ${stats.dueToday} due today, ${stats.high} high priority.`}
        publishTitle="Task progress"
        publishBody={`I have ${stats.open} open tasks and ${stats.dueToday} due today.`}
      />
    </MiniAppShell>
  );
}
