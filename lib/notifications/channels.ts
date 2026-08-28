import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Android notification channels, one per kind of interruption.
 *
 * Everything Echo has ever posted has gone to a single channel called
 * "default" at HIGH importance. Android surfaces channels — not apps — in the
 * per-app notification settings, so a user who wanted to silence "someone liked
 * your echo" had exactly one lever: turn Echo off entirely. That is how an app
 * loses notification permission for good.
 *
 * Splitting by kind gives the OS something to offer: keep DMs buzzing, mute the
 * social confetti, leave moderation alone. The channel is also where sound and
 * vibration live on Android 8+ — the per-notification `sound` field is ignored —
 * so this is the only place those can be set at all.
 *
 * Channels are immutable once created. Android ignores importance/sound changes
 * on an existing channel id, so tuning one later means a new id, not an edit.
 */

import {
  CHANNEL_DAILY,
  CHANNEL_MESSAGES,
  CHANNEL_SOCIAL,
  CHANNEL_SYSTEM,
} from './routing';

export { CHANNEL_DAILY, CHANNEL_MESSAGES, CHANNEL_SOCIAL, CHANNEL_SYSTEM, channelForKind } from './routing';

const CHANNELS: { id: string; name: string; description: string; importance: number; vibrate: boolean }[] = [
  {
    id: CHANNEL_MESSAGES,
    name: 'Messages',
    description: 'Direct messages sent to you.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrate: true,
  },
  {
    id: CHANNEL_SOCIAL,
    name: 'Likes, comments and follows',
    description: 'When someone reacts to, comments on, or follows your echoes.',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrate: false,
  },
  {
    id: CHANNEL_DAILY,
    name: 'Daily question and nudges',
    description: "The day's question, and the occasional reminder to come back.",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrate: false,
  },
  {
    id: CHANNEL_SYSTEM,
    name: 'Account and moderation',
    description: 'Decisions about your content or your account. Rare, and worth reading.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrate: true,
  },
];

/** Idempotent — Android treats a repeat create of an existing id as a no-op. */
export async function registerNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Promise.all(
    CHANNELS.map(c =>
      Notifications.setNotificationChannelAsync(c.id, {
        name: c.name,
        description: c.description,
        importance: c.importance,
        vibrationPattern: c.vibrate ? [0, 250, 250, 250] : undefined,
        enableVibrate: c.vibrate,
      }),
    ),
  );
}
