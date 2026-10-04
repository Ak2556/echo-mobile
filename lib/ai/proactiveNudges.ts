import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProactiveContext } from './proactiveAI';

// Reach-back layer: a couple of daily local notifications from Echo that pull
// the user back into the AI chat, where the proactive opener meets them with
// live context. Local (on-device) scheduling means this works without a server
// cron — honest for now; at scale the same slots become server push carrying
// per-user context. Tapping routes to the Chat tab (data.kind = echo_checkin,
// handled in app/_layout.tsx).

const IDS_KEY = 'ai:proactiveNotifIds';

const SLOTS: { hour: number; minute: number; body: string }[] = [
  { hour: 9, minute: 0, body: 'Morning — want to plan the day and protect your first focus block?' },
  { hour: 19, minute: 30, body: 'Evening check-in: how did today go? Two minutes makes tomorrow sharper.' },
];

async function cancelExisting(): Promise<void> {
  try {
    const prev: string[] = JSON.parse((await AsyncStorage.getItem(IDS_KEY)) ?? '[]');
    await Promise.all(prev.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    await AsyncStorage.removeItem(IDS_KEY);
  } catch { /* ignore */ }
}

/**
 * One-time migration: cancel legacy fixed-slot check-ins now that personalized
 * nudges (lib/personalNudges) own reach-back scheduling. Idempotent — once the
 * stored ids are cleared, subsequent calls are no-ops.
 */
export async function cancelLegacyProactiveNudges(): Promise<void> {
  await cancelExisting();
}

/**
 * Idempotently (re)schedule the daily Echo check-ins. Safe to call on every
 * app open — it cancels the previous set first. Requests notification
 * permission once; if denied, quietly does nothing. When a live context is
 * passed, the evening nudge names the actual streak on the line, so the
 * reach-back feels personal instead of generic.
 */
export async function syncProactiveNudges(enabled: boolean, ctx?: ProactiveContext): Promise<void> {
  await cancelExisting();
  if (!enabled) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const slots = SLOTS.map((slot, i) => {
      if (i === 1 && ctx?.streakAtRisk) {
        return { ...slot, body: `Your ${ctx.streakAtRisk.name} streak (${ctx.streakAtRisk.streak} days) is still open — finish it before the day ends?` };
      }
      return slot;
    });

    const ids: string[] = [];
    for (const slot of slots) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Echo',
          body: slot.body,
          sound: true,
          data: { kind: 'echo_checkin' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: slot.hour,
          minute: slot.minute,
        },
      });
      ids.push(id);
    }
    await AsyncStorage.setItem(IDS_KEY, JSON.stringify(ids));
  } catch { /* notifications unavailable (old build / denied) */ }
}
