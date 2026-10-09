import { useSyncExternalStore } from 'react';

/**
 * Photos the person has asked for while Data Saver is on.
 *
 * Data Saver used to pause videos and nothing else, so every photo still came
 * down at full size. With it on, a photo shows a tile and loads when tapped;
 * once loaded it stays loaded for the session, so scrolling back does not hide
 * what was just asked for.
 *
 * Session-only on purpose: a remembered "loaded" list would grow without bound
 * and would be wrong the day Data Saver is turned on again.
 */

const MAX_REMEMBERED = 500;
const loaded = new Set<string>();
const listeners = new Set<() => void>();

export function isPhotoLoaded(uri: string): boolean {
  return loaded.has(uri);
}

export function markPhotoLoaded(uri: string): void {
  if (!uri || loaded.has(uri)) return;
  if (loaded.size >= MAX_REMEMBERED) {
    // Oldest first: a Set iterates in insertion order.
    const oldest = loaded.values().next().value;
    if (oldest !== undefined) loaded.delete(oldest);
  }
  loaded.add(uri);
  listeners.forEach(l => l());
}

/** For tests and sign-out. */
export function resetLoadedPhotos(): void {
  loaded.clear();
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Whether this photo must wait for a tap, and how to ask for it. */
export function useDataSaverPhoto(uri: string, dataSaver: boolean): { held: boolean; load: () => void } {
  const isLoaded = useSyncExternalStore(subscribe, () => loaded.has(uri), () => false);
  return { held: dataSaver && !isLoaded, load: () => markPhotoLoaded(uri) };
}
