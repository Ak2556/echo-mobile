import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { track } from '../src/shared/lib/analytics';
import { captureException } from './monitoring';
import { persistGet, persistSet } from '../store/persist';
import { registerNotificationChannels } from './notifications/channels';
import { registerNotificationCategories } from './notifications/categories';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function getPushPermissionStatus(): Promise<Notifications.PermissionStatus> {
  if (Platform.OS === 'web') return Notifications.PermissionStatus.UNDETERMINED;
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  await initNotificationSurface();

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

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

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      await saveToken(session.user.id, token);
    }

    track('push_permission_granted', { source: 'os_prompt' });
    return { token, granted: true };
  } catch (e) {
    captureException(e, { tags: { source: 'push_register' } });
    return { token: null, granted: false };
  }
}

/**
 * Stop notifications for *this device*.
 *
 * Deleting every row for the account would be the easy version and the wrong
 * one: signing out on a tablet would silence the user's phone too. The token is
 * remembered on disk precisely so this still works after a restart, when
 * nothing is left in memory to identify the device by.
 */
export async function clearPushToken(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const token = knownToken();
    if (token) {
      await supabase.from('push_tokens').delete().eq('token', token).eq('user_id', session.user.id);
    }
    persistSet(TOKEN_KEY, '');

    // Legacy column: it holds one token for the whole account, so there is no
    // per-device version of clearing it.
    await supabase.from('profiles').update({ push_token: null }).eq('id', session.user.id);
  } catch {
  }
}

/** Remembered across restarts so sign-out can identify this device. */
const TOKEN_KEY = 'push:lastToken';

function knownToken(): string | null {
  const stored = persistGet<string>(TOKEN_KEY, '');
  return stored ? stored : null;
}

/**
 * Record this device's token against the account.
 *
 * Both tables are written on purpose. `push_tokens` is the real store, one row
 * per device. `profiles.push_token` is kept in step because the older installs
 * still out there read and write only that column, and two edge functions
 * (daily-question-push, personalized-fanout) still select from it. It can be
 * dropped once those are moved over.
 */
async function saveToken(userId: string, token: string): Promise<void> {
  persistSet(TOKEN_KEY, token);

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { token, user_id: userId, platform: Platform.OS, last_seen_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
  if (error) captureException(error, { tags: { source: 'push_token_save' } });

  const { error: legacyError } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', userId);
  if (legacyError && !legacyError.message.includes('not found')) {
    captureException(legacyError, { tags: { source: 'push_token_save_legacy' } });
  }
}

/**
 * Refresh the stored token on launch, without ever prompting.
 *
 * Expo push tokens rotate — on reinstall, on restore to a new device, and at
 * the OS's discretion. Nothing here used to run at startup, so a rotated token
 * left the account pointing at an address that no longer resolved and
 * notifications stopped with no error anywhere. Only runs when permission is
 * already granted, so it can never turn into a surprise permission dialog.
 */
export async function registerPushAndStoreToken(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const status = await getPushPermissionStatus();
  if (status !== 'granted') return;
  await registerForPush();
}

/**
 * Register the channels and actions the OS draws notifications with.
 *
 * Safe to call before permission is granted and safe to call repeatedly — both
 * halves are idempotent — so this runs at startup rather than waiting for the
 * permission prompt. It has to: a category is matched by id at delivery time,
 * so a Reply button only appears if the category was registered *before* the
 * notification arrived.
 *
 * Until this shipped, nothing set a `channelId` anywhere, which means every
 * Echo notification has been landing on expo-notifications' own fallback
 * channel (`expo_notifications_fallback_notification_channel`) and the "default"
 * channel this used to create was never used by anything.
 */
export async function initNotificationSurface(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Promise.all([registerNotificationChannels(), registerNotificationCategories()]);
  } catch (e) {
    // A missing Reply button is not worth a failed startup.
    captureException(e, { tags: { source: 'notification_surface_init' } });
  }
}
