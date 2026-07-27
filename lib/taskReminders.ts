// Local reminders for the Tasks mini-app. A task with a due date + "remind me"
// schedules a one-off notification at its due time; completing or deleting the
// task cancels it. Kept separate from lib/tasks.ts so the task model stays free
// of the expo-notifications import. Never throws — reminders are best-effort.

import * as Notifications from 'expo-notifications';
import { type TaskItem, taskDueAt } from './tasks';

/**
 * Schedule (or reschedule) a reminder for a task. Cancels any existing reminder
 * first. Returns the new notification id, or null if nothing was scheduled
 * (no due date/time, time already passed, or permission denied).
 */
export async function scheduleTaskReminder(task: TaskItem): Promise<string | null> {
  try {
    await cancelTaskReminder(task.reminderId);

    const when = taskDueAt(task);
    if (!when || when.getTime() <= Date.now()) return null;

    const perm = await Notifications.getPermissionsAsync();
    const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: '✓ Task due',
        body: task.title,
        sound: true,
        data: { kind: 'task_reminder', route: '/mini-apps/tasks', taskId: task.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  } catch {
    return null;
  }
}

/** Cancel a task's scheduled reminder, if any. */
export async function cancelTaskReminder(reminderId?: string): Promise<void> {
  if (!reminderId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderId);
  } catch {
    // ignore — a missing/expired notification is fine
  }
}
