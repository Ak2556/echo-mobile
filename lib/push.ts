// Push notification registration. Loads expo-notifications lazily so dev
// builds without it (e.g. Expo Go on macOS) keep running. Production builds
// should `npm install expo-notifications` and add the plugin to app.json.

import { supabase } from './supabase';

export async function registerPushAndStoreToken(userId: string | null | undefined) {
  if (!userId) return;
  let Notifications: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
  } catch {
    return; // dependency not installed yet
  }
  try {
    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data;
    if (!token) return;
    await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  } catch {
    // best-effort; never block app startup
  }
}
