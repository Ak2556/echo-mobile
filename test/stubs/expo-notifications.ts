// Test-only stub for expo-notifications. The real package imports
// expo-modules-core / the Expo native runtime, which can't load under
// vitest/node. App modules (milestones, nudges, push) import this at module
// load time; unit tests never assert on scheduling, so no-ops are sufficient.
export const PermissionStatus = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDETERMINED: 'undetermined',
} as const;

export const AndroidImportance = {
  MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5,
} as const;

export const AndroidNotificationVisibility = {
  UNKNOWN: 0, PUBLIC: 1, PRIVATE: 2, SECRET: 3,
} as const;

export const SchedulableTriggerInputTypes = {
  DATE: 'date',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  TIME_INTERVAL: 'timeInterval',
  CALENDAR: 'calendar',
} as const;

export const getPermissionsAsync = async () => ({ status: PermissionStatus.GRANTED, granted: true });
export const requestPermissionsAsync = async () => ({ status: PermissionStatus.GRANTED, granted: true });
export const getExpoPushTokenAsync = async () => ({ data: 'stub-token' });
export const scheduleNotificationAsync = async () => 'stub-id';
export const cancelScheduledNotificationAsync = async () => {};
export const setNotificationChannelAsync = async () => {};
export const setNotificationHandler = () => {};
