/**
 * M11 (2026-09-30 release audit): the OS notification prompt appeared the
 * moment a fresh install opened, signed out. The root layout calls
 * ensureNudgesScheduled on every launch, and nudge scheduling requested the
 * permission itself — bypassing the in-context PushPrePrompt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestPermissionsAsync = vi.fn(async () => ({ granted: true, status: 'granted' }));
let granted = false;
const scheduled: unknown[] = [];

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(async () => ({ granted, status: granted ? 'granted' : 'undetermined' })),
  requestPermissionsAsync: (...a: unknown[]) => requestPermissionsAsync(...(a as [])),
  scheduleNotificationAsync: vi.fn(async (req: unknown) => { scheduled.push(req); return 'id'; }),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  setNotificationChannelAsync: vi.fn(async () => {}),
}));

import { syncPersonalNudges } from './personalNudges';

beforeEach(() => {
  requestPermissionsAsync.mockClear();
  scheduled.length = 0;
});

describe('nudge scheduling never asks for notification permission', () => {
  it('without permission: no prompt, nothing scheduled', async () => {
    granted = false;
    await syncPersonalNudges(true);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(0);
  });

  it('with permission already granted: still no prompt', async () => {
    granted = true;
    await syncPersonalNudges(true);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('disabled: no prompt', async () => {
    granted = false;
    await syncPersonalNudges(false);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
