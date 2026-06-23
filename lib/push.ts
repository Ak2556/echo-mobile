import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { track } from './analytics';
import { captureException } from './monitoring';

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

export async function clearPushToken(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    await supabase.from('profiles').update({ push_token: null }).eq('id', session.user.id);
  } catch {
  }
}

export async function registerPushAndStoreToken(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const status = await getPushPermissionStatus();
  if (status !== 'granted') return;
  await registerForPush();
}
