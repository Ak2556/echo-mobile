import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { type KhataProfile } from './expenses';

const IDS_KEY = 'mini:expenses:reminderIds';

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const KHATA_LINES = [
  'Time to close the books. Log your daily entries before you forget!',
  'Your Khata is waiting. Did you lend or spend today?',
  'Keep your ledger clean. Two minutes now saves an hour tomorrow.',
  'End of the day check-in: any dues to collect or pay?',
  'Money talks, but it doesn’t log itself. Update your Khata.',
];

async function cancelExisting(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(IDS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(IDS_KEY);
  } catch {}
}

export function syncExpenseReminders(enabled: boolean, profile: KhataProfile): void {
  void (async () => {
    try {
      await cancelExisting();
      if (!enabled) return;
      const perm = await Notifications.getPermissionsAsync();
      const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) return;

      const title = profile === 'personal' ? '💸 Daily Expense Check' 
                  : profile === 'farmer' ? '🚜 Mandi Ledger Update' 
                  : '📘 Khata Closing Time';

      const ids: string[] = [];
      const id = await Notifications.scheduleNotificationAsync({
        content: { title, body: pick(KHATA_LINES), sound: true, data: { kind: 'khata_reminder', route: '/mini-apps/expenses' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 21, minute: 0 },
      });
      ids.push(id);
      await AsyncStorage.setItem(IDS_KEY, JSON.stringify(ids));
    } catch {}
  })();
}
