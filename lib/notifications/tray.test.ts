import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConversationNotifications } from './tray';

const presented = vi.hoisted(() => ({ list: [] as { request: { identifier: string; content: { data: unknown } } }[] }));
const dismissed = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({
  getPresentedNotificationsAsync: async () => presented.list,
  dismissNotificationAsync: async (id: string) => { dismissed.ids.push(id); },
}));

const note = (identifier: string, data: unknown) => ({ request: { identifier, content: { data } } });

describe('clearConversationNotifications', () => {
  beforeEach(() => { dismissed.ids = []; });

  it("removes that conversation's DM pushes and nothing else", async () => {
    presented.list = [
      note('a', { kind: 'dm', target_id: 'c1' }),
      note('b', { kind: 'dm', target_id: 'c2' }),
      note('c', { kind: 'comment', target_id: 'c1' }),
      note('d', { kind: 'dm', target_id: 'c1' }),
    ];
    await clearConversationNotifications('c1');
    expect(dismissed.ids.sort()).toEqual(['a', 'd']);
  });

  it('does nothing when the tray is empty', async () => {
    presented.list = [];
    await clearConversationNotifications('c1');
    expect(dismissed.ids).toEqual([]);
  });
});
