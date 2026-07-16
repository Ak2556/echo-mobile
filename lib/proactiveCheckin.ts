import AsyncStorage from '@react-native-async-storage/async-storage';

// In-app pull for the proactive companion: a "check-in waiting" dot on the
// Chat tab, so Echo draws you in even without notification permission. The
// signal is intentionally simple and non-naggy — one dot per day until you
// open the AI chat, then it clears until tomorrow.

const KEY = 'ai:checkinSeenDate';

const today = () => new Date().toISOString().slice(0, 10);

/** True when the user hasn't opened the AI chat yet today. */
export async function isCheckinPending(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) !== today();
  } catch {
    return false;
  }
}

/** Call when the user views the AI chat — clears the dot for the day. */
export async function markCheckinSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, today());
  } catch {
    // best-effort — a missed write just re-shows the dot, never breaks anything
  }
}
