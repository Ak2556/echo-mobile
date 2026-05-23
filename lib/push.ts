import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { track } from './analytics';
import { captureException } from './monitoring';

/**
 * Push notifications wiring.
 *
 * Three responsibilities:
 *   1. Request permission (called from the in-app PushPrePrompt → onAccept)
 *   2. Fetch the Expo push token
 *   3. Persist the token to profiles.push_token so the server can target it
 *
 * Notification taps and deep-link handling are set up in app/_layout.tsx via
 * Notifications.addNotificationResponseReceivedListener.
 *
 * Wiring deps (already in package.json):
 *   - expo-notifications: ~0.32.17
 *   - app.json plugin: "expo-notifications" with icon + color
 *
 * Server side: send-push-on-notification edge fn (TBD) reads the row from
 * `notifications` (pg trigger) and calls Expo's push API with the token from
 * profiles.push_token. APNs cert is managed by Expo Push (no manual upload).
 */

// Set how the OS handles notifications received while the app is in foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Whether the user has previously granted, denied, or never been asked. */
export async function getPushPermissionStatus(): Promise<Notifications.PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/**
 * Ask the OS for permission. Returns true on grant. This is the call that
 * follows the in-app PushPrePrompt → onAccept handler — the OS prompt fires
 * here, not on app start.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Echo',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Register this device for push: get the Expo push token and persist it
 * against the current Supabase user. Idempotent — safe to call on every
 * session start where status is already granted.
 */
export async function registerForPush(): Promise<{ token: string | null; granted: boolean }> {
  try {
    const granted = await requestPushPermission();
    if (!granted) {
      track('push_permission_denied', { source: 'os_prompt' });
      return { token: null, granted: false };
    }

    const projectId =
      (Constants?.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    if (!projectId) {
      // eslint-disable-next-line no-console
      console.warn('[push] no EAS projectId — skipping push token fetch');
      return { token: null, granted: true };
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;

    // Persist against the current user. Fails silently — push is best-effort
    // and we don't want to surface this in any error UI.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const { error } = await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', session.user.id);
      if (error && !error.message.includes('not found')) {
        captureException(error, { tags: { source: 'push_token_save' } });
      }
    }

    track('push_permission_granted', { source: 'os_prompt' });
    return { token, granted: true };
  } catch (e) {
    captureException(e, { tags: { source: 'push_register' } });
    return { token: null, granted: false };
  }
}

/** Clear the token from the profile on sign-out. Best-effort. */
export async function clearPushToken(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    await supabase.from('profiles').update({ push_token: null }).eq('id', session.user.id);
  } catch {
    // intentionally swallow — we're signing out anyway
  }
}

/** Backwards-compat shim for the older callsite. */
export async function registerPushAndStoreToken(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  // Only re-register if permission already granted — don't trigger the OS
  // prompt from an unrelated call site. The proper flow is via the
  // PushPrePrompt → requestPushPermission() chain.
  const status = await getPushPermissionStatus();
  if (status !== 'granted') return;
  await registerForPush();
}
