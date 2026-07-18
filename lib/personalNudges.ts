/**
 * Personalized reach-back nudges — Stage 1 (on-device).
 *
 * Supersedes the fixed-slot proactiveNudges: instead of pinging everyone at
 * 09:00 / 19:30, it schedules local notifications at each user's *learned*
 * active hours (see engagementModel) and leads with the surface they actually
 * open, overridden by any live signal worth surfacing (an unanswered daily
 * question with a streak on the line beats a generic "come back").
 *
 * Guardrails (quiet hours, daily cap, dismiss back-off) live in the model so
 * personalization means *fewer, sharper* pings, not more.
 *
 * Stage 2 will move precise sent/opened accounting server-side; here we learn
 * timing + interest on-device and treat a notification tap as the open signal.
 */

import * as Notifications from 'expo-notifications';
import { persistGet, persistSet } from '../store/persist';
import {
  type EngagementModel, type Surface, type NudgePolicy,
  emptyModel, recordOpen, recordNudgeOpened, plannedNudgeHours,
  DEFAULT_POLICY,
} from './engagementModel';
import { type NudgeSignals, buildPlannedNudges } from './nudgeContent';

export type { NudgeSignals } from './nudgeContent';

const MODEL_KEY = 'nudges:engagementModel';
const IDS_KEY = 'nudges:scheduledIds';

export function loadModel(): EngagementModel {
  return persistGet<EngagementModel>(MODEL_KEY, emptyModel());
}
function saveModel(m: EngagementModel): void {
  persistSet(MODEL_KEY, m);
}

/** Record an app open (optionally attributed to a surface) into the model. */
export function recordAppOpen(surface?: Surface): void {
  try { saveModel(recordOpen(loadModel(), new Date(), surface)); } catch { /* best effort */ }
}

/** A notification tap is our on-device "opened" signal — resets back-off. */
export function noteNudgeOpened(): void {
  try { saveModel(recordNudgeOpened(loadModel())); } catch { /* best effort */ }
}

async function cancelExisting(): Promise<void> {
  try {
    const prev = persistGet<string[]>(IDS_KEY, []);
    await Promise.all(prev.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    persistSet(IDS_KEY, []);
  } catch { /* ignore */ }
}

/**
 * (Re)schedule the day's personalized nudges. Idempotent — cancels the previous
 * set first, so it's safe to call on every app open. Requests notification
 * permission once; quietly no-ops if denied or disabled.
 */
export async function syncPersonalNudges(
  enabled: boolean,
  signals: NudgeSignals = {},
  policy: NudgePolicy = DEFAULT_POLICY,
): Promise<void> {
  await cancelExisting();
  if (!enabled) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const model = loadModel();
    const hours = plannedNudgeHours(model, policy);
    if (hours.length === 0) return;

    const planned = buildPlannedNudges(model, signals, hours);
    const ids: string[] = [];
    for (const n of planned) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: n.title,
          body: n.body,
          sound: true,
          data: { kind: 'personal_nudge', surface: n.surface },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: n.hour,
          minute: 0,
        },
      });
      ids.push(id);
    }
    persistSet(IDS_KEY, ids);
  } catch { /* notifications unavailable (old build / denied) */ }
}
