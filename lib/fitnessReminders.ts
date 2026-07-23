// Local daily reminders for the Fitness app — driven by the reminder toggles in
// Fitness Settings. Cancels any previously-scheduled fitness reminders and
// reschedules from the current settings. Requesting permission here is fine:
// the user explicitly turned a reminder on. Never throws.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { FitnessSettings } from './fitness';

const IDS_KEY = 'mini:fitness:reminderIds';

async function cancelExisting(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(IDS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(IDS_KEY);
  } catch {
    // ignore
  }
}

export function syncFitnessReminders(settings: FitnessSettings): void {
  void (async () => {
    try {
      await cancelExisting();
      const r = settings.reminders;
      if (!r.meals && !r.water && !r.workout) return;
      const perm = await Notifications.getPermissionsAsync();
      const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) return;

      const ids: string[] = [];
      const daily = async (hour: number, minute: number, title: string, body: string) => {
        const id = await Notifications.scheduleNotificationAsync({
          content: { title, body, sound: true, data: { kind: 'fitness_reminder' } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
        });
        ids.push(id);
      };

      if (r.water) {
        await daily(11, 0, '💧 Hydration', 'Time for some water.');
        await daily(15, 0, '💧 Hydration', 'Another glass of water?');
        await daily(19, 0, '💧 Hydration', 'Top up your water for the day.');
      }
      if (r.meals) await daily(20, 30, '🍽️ Log your meals', 'Track what you ate today to keep your macros honest.');
      if (r.workout) await daily(17, 30, '💪 Workout time', 'Have you moved today? Keep your weekly streak going.');

      await AsyncStorage.setItem(IDS_KEY, JSON.stringify(ids));
    } catch {
      // ignore
    }
  })();
}
