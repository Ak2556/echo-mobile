// Local daily reminders for the Fitness app — driven by the reminder toggles in
// Fitness Settings. Cancels any previously-scheduled fitness reminders and
// reschedules from the current settings. Requesting permission here is fine:
// the user explicitly turned a reminder on. Never throws.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { FitnessSettings } from './fitness';

const IDS_KEY = 'mini:fitness:reminderIds';

// Voice: a witty friend narrating your day, never a system alert. Each slot
// picks a variant so the same nag never reads twice.
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const WATER_LINES = [
  'Hydrate or diedrate. Mostly the first one.',
  'Your cells are staging a tiny drought protest. One glass ends it.',
  'Water break — and no, coffee doesn’t count. Sorry.',
  'Drink some water before your body files a formal complaint.',
  'A glass now = you, smug and dewy, later.',
  'Plants get watered daily and they’re thriving. Just saying.',
  'Your brain runs on water, not vibes. Top it up.',
  'Sip sip hooray. Go get some water.',
  'Dehydration called. Hung up on it with a glass of water.',
];
const MEAL_LINES = [
  'Log what you ate before your memory conveniently forgets the snacks.',
  'Feed the tracker the truth. All of it. Even that.',
  'Your macros want a status update. Two taps, zero judgment. (Some judgment.)',
  'That “I’ll log it later” energy? It’s later.',
  'Tell the app what you ate. It won’t tell anyone. Probably.',
  'Your food diary is emptier than your fridge on a Sunday. Fix one.',
];
const WORKOUT_LINES = [
  'Move your body before the couch claims you as its own.',
  'Future you is already sweating. Present you should probably join.',
  '30 minutes now buys a whole evening of insufferable smugness.',
  'Your weekly streak is giving you a look. You know the one.',
  'The hardest part is the shoes. Put on the shoes.',
  'Endorphins are free and legal. Go earn some.',
  'A short workout beats the imaginary long one. Let’s go.',
];

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
        // Distinct lines across the three slots so a single day never repeats.
        const [w1, w2, w3] = [...WATER_LINES].sort(() => Math.random() - 0.5);
        await daily(11, 0, '💧 Hydration check', w1);
        await daily(15, 0, '💧 Hydration check', w2);
        await daily(19, 0, '💧 Hydration check', w3);
      }
      if (r.meals) await daily(20, 30, '🍽️ Feed the tracker', pick(MEAL_LINES));
      if (r.workout) await daily(17, 30, '💪 Move it', pick(WORKOUT_LINES));

      await AsyncStorage.setItem(IDS_KEY, JSON.stringify(ids));
    } catch {
      // ignore
    }
  })();
}
