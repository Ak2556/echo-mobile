import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';
import { pushTasksStructured } from './tasksRemote';

export const TASKS_KEY = 'mini:tasks';

export type TaskPriority = 'low' | 'normal' | 'high';

export interface TaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  done: boolean;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
}

export function todayTaskDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function tomorrowTaskDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function normalize(raw: unknown): TaskItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<TaskItem> => !!item && typeof item === 'object')
    .map(item => {
      const priority: TaskPriority = item.priority === 'low' || item.priority === 'high' ? item.priority : 'normal';
      return {
        id: typeof item.id === 'string' ? item.id : `${Date.now()}`,
        title: typeof item.title === 'string' ? item.title : '',
        notes: typeof item.notes === 'string' ? item.notes : undefined,
        due: typeof item.due === 'string' ? item.due : undefined,
        done: item.done === true,
        priority,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
      };
    })
    .filter(item => item.title.trim());
}

export async function loadTasks(): Promise<TaskItem[]> {
  const remote = await pullMiniAppIfNewer('tasks');
  if (Array.isArray(remote)) {
    const next = normalize(remote);
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(next));
    if (next.length) pushTasksStructured(next); // backfill for existing users
    return next;
  }
  try {
    const local = normalize(JSON.parse((await AsyncStorage.getItem(TASKS_KEY)) ?? '[]'));
    if (local.length) pushTasksStructured(local); // backfill for existing users
    return local;
  } catch {
    return [];
  }
}

export async function saveTasks(tasks: TaskItem[]): Promise<void> {
  const sorted = tasks.slice().sort((a, b) =>
    Number(a.done) - Number(b.done) ||
    priorityWeight(b.priority) - priorityWeight(a.priority) ||
    String(a.due ?? '9999').localeCompare(String(b.due ?? '9999')) ||
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(sorted));
  pushMiniApp('tasks', sorted);
  pushTasksStructured(sorted);
}

export function priorityWeight(priority: TaskPriority): number {
  return priority === 'high' ? 3 : priority === 'normal' ? 2 : 1;
}

export function taskStats(tasks: TaskItem[]) {
  const today = todayTaskDate();
  const open = tasks.filter(task => !task.done);
  return {
    total: tasks.length,
    open: open.length,
    done: tasks.length - open.length,
    dueToday: open.filter(task => task.due === today).length,
    high: open.filter(task => task.priority === 'high').length,
  };
}
