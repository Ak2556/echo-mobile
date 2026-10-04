/**
 * Light/dark preference. 'system' follows the device and is the default, so a
 * person on a light phone is not greeted by a dark app they never asked for;
 * 'light' and 'dark' are an explicit override.
 */
export type AppearanceMode = 'system' | 'light' | 'dark';

export const APPEARANCE_MODES: readonly AppearanceMode[] = ['system', 'light', 'dark'];

export function isAppearanceMode(v: unknown): v is AppearanceMode {
  return v === 'system' || v === 'light' || v === 'dark';
}

/**
 * Whether the UI should be dark. An unreadable system scheme (null — some
 * web/older runtimes) resolves dark, which was the app's only look before this
 * setting existed.
 */
export function resolveIsDark(mode: AppearanceMode, systemScheme: string | null | undefined): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return systemScheme !== 'light';
}

/**
 * Status bar icon colour for a resolved theme. The icons are drawn by the system,
 * so they have to be told: 'light' means light icons (for a dark background). Left
 * unset, Android kept them white, and on a light theme the clock, signal and battery
 * disappeared into the background.
 */
export function statusBarStyleFor(isDark: boolean): 'light' | 'dark' {
  return isDark ? 'light' : 'dark';
}

/**
 * Initial mode from what is on disk. `darkMode` used to be the only switch and
 * was only written when the person flipped it, so a stored value is a real
 * choice and is kept; no stored value means they never chose, so follow the
 * device.
 */
export function initialAppearance(storedMode: unknown, storedDarkMode: boolean | null): AppearanceMode {
  if (isAppearanceMode(storedMode)) return storedMode;
  if (typeof storedDarkMode === 'boolean') return storedDarkMode ? 'dark' : 'light';
  return 'system';
}
