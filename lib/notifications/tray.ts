import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { isDmFor } from './activeChat';

/**
 * Take a conversation's pushes out of the system tray.
 *
 * Opening a thread (or coming back to the app while it is open) is the user
 * reading those messages; leaving the banners behind makes the tray a list of
 * things already dealt with. Only this conversation's DM pushes go, every other
 * chat and every other kind stays. Best effort: a tray that cannot be read is
 * left as it was, never an error.
 */
export async function clearConversationNotifications(conversationId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((n) => isDmFor(n.request.content.data, conversationId))
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {
    // notifications unavailable (old build, denied): nothing to clear
  }
}
