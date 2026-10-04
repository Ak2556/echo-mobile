import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES } from './presentation';
import { INBOX, PUSH_ONLY_KINDS, flowRoute, resolveTapRoute, tapRoute, tapRouteFromPush, tapRouteOrInbox } from './tapTarget';

const ID = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
const OTHER = '9a1c2d3e-4b5f-4a6b-8c7d-0e1f2a3b4c5d';

describe('every kind the database can create lands somewhere deliberate', () => {
  // Kinds that are a screen of their own, with no id needed.
  const fixed: Record<string, string> = {
    daily_react: '/daily-question',
    friend_answer: '/daily-question',
    appeal_resolved: '/appeal',
    report_resolved: '/my-reports',
    rules_reminder: '/legal/rules',
    social_task_update: '/mini-apps/tasks',
  };
  const thread = ['like', 'comment', 'repost', 'mention', 'reaction', 'bookmark', 'quote', 'friend_post'];

  it('covers the whole notifications_type_check list, so a new type forces a decision here', () => {
    const decided = new Set([...Object.keys(fixed), ...thread, 'follow', 'dm', 'content_removed', 'personal_nudge', 'report_urgent']);
    expect([...NOTIFICATION_TYPES].filter((t) => !decided.has(t))).toEqual([]);
  });

  it.each(Object.entries(fixed))('%s goes to %s', (kind, route) => {
    expect(tapRoute({ kind })).toBe(route);
  });

  it.each(thread)('%s opens the echo it is about', (kind) => {
    // friend_post (the second most common kind) and the rest used to be dropped by the
    // push handler's own kind list, so tapping them only opened the app.
    expect(tapRoute({ kind, targetId: ID })).toEqual({ pathname: '/thread/[id]', params: { id: ID } });
  });

  it('follow opens the follower, who is the actor, not a target', () => {
    expect(tapRoute({ kind: 'follow', actorId: ID })).toEqual({ pathname: '/user/[id]', params: { id: ID } });
    expect(tapRoute({ kind: 'follow', targetId: OTHER })).toEqual({ pathname: '/user/[id]', params: { id: OTHER } });
  });

  it('dm opens the conversation', () => {
    expect(tapRoute({ kind: 'dm', targetId: ID })).toEqual({ pathname: '/messages/[id]', params: { id: ID } });
  });

  it('content_removed opens the appeal for that decision', () => {
    expect(tapRoute({ kind: 'content_removed', targetId: ID })).toEqual({ pathname: '/appeal', params: { decisionId: ID } });
    expect(tapRoute({ kind: 'content_removed' })).toBe('/appeal');
  });

  it('a daily-question reaction is not routed to a thread that does not exist', () => {
    // target_id is a daily_answers row.
    expect(tapRoute({ kind: 'friend_answer', targetId: ID })).toBe('/daily-question');
  });
});

describe('push-only kinds', () => {
  it('daily_question and echo_checkin have a home', () => {
    expect(tapRoute({ kind: 'daily_question' })).toBe('/daily-question');
    expect(tapRoute({ kind: 'echo_checkin' })).toBe('/(tabs)/chat');
    expect(PUSH_ONLY_KINDS).toEqual(['daily_question', 'echo_checkin']);
  });

  it('a nudge with a concrete route opens that route', () => {
    expect(tapRoute({ kind: 'personal_nudge', route: '/mini-apps/habits' })).toBe('/mini-apps/habits');
  });

  it('a nudge falls back to its surface, then to chat', () => {
    expect(tapRoute({ kind: 'personal_nudge', surface: 'daily' })).toBe('/daily-question');
    expect(tapRoute({ kind: 'personal_nudge', surface: 'dm' })).toBe('/messages');
    expect(tapRoute({ kind: 'personal_nudge', surface: 'feed' })).toBe('/(tabs)/home');
    expect(tapRoute({ kind: 'personal_nudge', surface: 'marketplace' })).toBe('/mini-apps/marketplace');
    expect(tapRoute({ kind: 'personal_nudge' })).toBe('/(tabs)/chat');
  });

  it('refuses a nudge route that is not an in-app path', () => {
    for (const route of ['https://evil.example', '//evil.example', '/../etc', 'javascript:alert(1)', '/a b']) {
      expect(tapRoute({ kind: 'personal_nudge', route, surface: 'feed' })).toBe('/(tabs)/home');
    }
  });
});

describe('when there is nothing to open', () => {
  it('an id-based kind with a missing or unsafe id resolves to null', () => {
    expect(tapRoute({ kind: 'like' })).toBeNull();
    expect(tapRoute({ kind: 'dm', targetId: '../../admin' })).toBeNull();
    expect(tapRoute({ kind: 'follow', actorId: '' })).toBeNull();
  });

  it('a kind with no in-app screen resolves to null (report_urgent is reviewed in the dashboard)', () => {
    expect(tapRoute({ kind: 'report_urgent', targetId: ID })).toBeNull();
  });

  it('an unknown kind resolves to null rather than guessing a thread', () => {
    expect(tapRoute({ kind: 'something_new', targetId: ID })).toBeNull();
  });

  it('tapRouteOrInbox sends a push tap to the inbox instead of just opening the app', () => {
    expect(tapRouteOrInbox({ kind: 'like' })).toBe(INBOX);
    expect(tapRouteOrInbox({ kind: 'report_urgent' })).toBe(INBOX);
    expect(tapRouteOrInbox({ kind: 'dm', targetId: ID })).toEqual({ pathname: '/messages/[id]', params: { id: ID } });
  });
});

describe('tapRouteFromPush reads the data an Expo push carries', () => {
  it('uses target_id, then the legacy echo_id and user_id', () => {
    expect(tapRouteFromPush({ kind: 'comment', target_id: ID })).toEqual({ pathname: '/thread/[id]', params: { id: ID } });
    expect(tapRouteFromPush({ kind: 'like', echo_id: OTHER })).toEqual({ pathname: '/thread/[id]', params: { id: OTHER } });
    expect(tapRouteFromPush({ kind: 'follow', user_id: ID })).toEqual({ pathname: '/user/[id]', params: { id: ID } });
  });

  it('reads a nudge from the server (target_kind) as well as a local one (surface)', () => {
    expect(tapRouteFromPush({ kind: 'personal_nudge', target_kind: 'feed' })).toBe('/(tabs)/home');
    expect(tapRouteFromPush({ kind: 'personal_nudge', surface: 'daily' })).toBe('/daily-question');
  });

  it('is null for missing data and non-object data', () => {
    expect(tapRouteFromPush(null)).toBeNull();
    expect(tapRouteFromPush(undefined)).toBeNull();
    expect(tapRouteFromPush({})).toBeNull();
  });
});

describe('reminders the app schedules on the device', () => {
  it.each([
    ['task_reminder', '/mini-apps/tasks'],
    ['khata_reminder', '/mini-apps/expenses'],
    ['fitness_reminder', '/mini-apps/fitness'],
    ['habit_reminder', '/mini-apps/habits'],
    ['pomodoro_done', '/mini-apps/pomodoro'],
    ['workout_rest', '/mini-apps/fitness'],
    ['milestone', '/(tabs)/you'],
  ])('%s opens %s', (kind, route) => {
    expect(tapRoute({ kind })).toBe(route);
  });

  it('prefers a route the payload carries, but only an in-app one', () => {
    expect(tapRoute({ kind: 'task_reminder', route: '/mini-apps/planner' })).toBe('/mini-apps/planner');
    expect(tapRoute({ kind: 'task_reminder', route: 'https://evil.example' })).toBe('/mini-apps/tasks');
  });

  it('is reached through the push data shape too', () => {
    expect(tapRouteFromPush({ kind: 'task_reminder', route: '/mini-apps/tasks', taskId: 'x' })).toBe('/mini-apps/tasks');
  });
});

describe('every notification the app schedules can be tapped to somewhere', () => {
  // A call site with no `data.kind` is a notification whose tap only opens the app,
  // which is how habit, timer and workout alarms behaved.
  const { readFileSync, readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const root = join(__dirname, '..', '..');

  function walk(dir: string): string[] {
    return readdirSync(join(root, dir)).flatMap((name: string) => {
      const rel = join(dir, name);
      if (statSync(join(root, rel)).isDirectory()) return walk(rel);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : [];
    });
  }

  const sites: { file: string; kind: string | null }[] = [];
  for (const file of ['app', 'components', 'lib', 'hooks'].flatMap(walk)) {
    const src = readFileSync(join(root, file), 'utf8');
    let at = src.indexOf('scheduleNotificationAsync({');
    while (at !== -1) {
      const block = src.slice(at, src.indexOf('trigger:', at));
      sites.push({ file, kind: /kind:\s*'([a-z_]+)'/.exec(block)?.[1] ?? null });
      at = src.indexOf('scheduleNotificationAsync({', at + 1);
    }
  }

  it('finds the schedule sites', () => {
    expect(sites.length).toBeGreaterThanOrEqual(8);
  });

  it('gives every one a kind the resolver knows', () => {
    const lost = sites.filter((s) => !s.kind || tapRoute({ kind: s.kind, targetId: ID }) === null).map((s) => `${s.file} (${s.kind})`);
    expect(lost).toEqual([]);
  });
});


describe('a friend\'s new video opens in Flow', () => {
  const post = { kind: 'friend_post', targetId: ID };
  const flow = { pathname: '/(tabs)/watch', params: { echoId: ID } };

  it('goes to Flow, opened on that echo, when the post is a video', async () => {
    expect(await resolveTapRoute(post, async () => true)).toEqual(flow);
    expect(flowRoute(ID)).toEqual(flow);
  });

  it('keeps the thread for a text or photo post', async () => {
    expect(await resolveTapRoute(post, async () => false)).toEqual({ pathname: '/thread/[id]', params: { id: ID } });
  });

  it('falls back to the thread when the lookup fails or is slow', async () => {
    const thread = { pathname: '/thread/[id]', params: { id: ID } };
    expect(await resolveTapRoute(post, async () => { throw new Error('offline'); })).toEqual(thread);
    expect(await resolveTapRoute(post, () => new Promise<boolean>(() => {}), 20)).toEqual(thread);
  });

  it('does not ask about kinds that always open their thread', async () => {
    let asked = 0;
    const isVideo = async () => { asked++; return true; };
    await resolveTapRoute({ kind: 'comment', targetId: ID }, isVideo);
    await resolveTapRoute({ kind: 'like', targetId: ID }, isVideo);
    expect(asked).toBe(0);
  });

  it('a friend_post with no usable id goes where it did before, not to Flow', async () => {
    expect(await resolveTapRoute({ kind: 'friend_post', targetId: '../x' }, async () => true)).toBe(INBOX);
  });
});
