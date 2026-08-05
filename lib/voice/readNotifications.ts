// "Read my notifications" — the notifications screen publishes its readable rows
// here; the voice read_notifications intent reads them aloud. Same decoupled
// pattern as readFeed.

import { speakSequence } from '../tts';
import type { AppLanguageCode } from '../languages';

let current: string[] = [];

/** Called by the notifications screen when its list changes. */
export function setReadableNotifications(items: string[]) {
  current = (items ?? []).map((t) => (t ?? '').trim()).filter(Boolean);
}

const MAX = 12;

export function readNotificationsAloud(intro?: string, language?: AppLanguageCode): number {
  const items = current.slice(0, MAX);
  const segments: string[] = [];
  if (intro) segments.push(intro);
  segments.push(...items);
  if (segments.length === 0) return 0;
  speakSequence(segments, { id: 'read-notifs', language });
  return items.length;
}
