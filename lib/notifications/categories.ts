import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ACTION_REPLY, CATEGORY_COMMENT, CATEGORY_DM } from './routing';

/**
 * Notification categories — the actions attached to a notification.
 *
 * A category is matched by id: the push carries `categoryId`, and the OS draws
 * whatever buttons were registered under that id on this device. So these must
 * be registered before the first notification arrives, not lazily.
 *
 * ## Why Reply opens the app
 *
 * `opensAppToForeground: false` is the version everyone wants — type in the
 * shade, hit send, never leave the app you were in. expo-notifications
 * documents what it costs: "If false and your app is killed (not just
 * backgrounded), NotificationResponseReceived listeners will not be triggered
 * when a user selects this action." There is no cold-start recovery for it
 * either — `getLastNotificationResponseAsync` only returns the response that
 * launched the app, and this action deliberately doesn't launch it.
 *
 * That means a user types a reply, taps send, watches the notification
 * disappear, and the message is gone. Silently. On the most common state an app
 * is in — killed. A message that looks sent and never arrives is worse than no
 * shade reply at all, so Reply foregrounds and the send happens on arrival,
 * where it is guaranteed and where a failure is visible.
 *
 * Getting the frictionless version needs a native path — reply handled in a
 * broadcast receiver rather than in JS (notifee, or a Notification Service
 * Extension on iOS). Worth doing; not doable from here.
 */

const REPLY_ACTION = (placeholder: string): Notifications.NotificationAction => ({
  identifier: ACTION_REPLY,
  buttonTitle: 'Reply',
  textInput: { submitButtonTitle: 'Send', placeholder },
  options: { opensAppToForeground: true },
});

export async function registerNotificationCategories(): Promise<void> {
  if (Platform.OS === 'web') return;

  await Promise.all([
    Notifications.setNotificationCategoryAsync(CATEGORY_DM, [REPLY_ACTION('Message…')]),
    Notifications.setNotificationCategoryAsync(CATEGORY_COMMENT, [REPLY_ACTION('Reply…')]),
  ]);
}
