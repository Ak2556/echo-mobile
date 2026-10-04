import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The routing table is tested in lib/notifications/tapTarget.test.ts. This pins the
// wiring around it, which is what a cold start from a tap actually depends on.
const layout = readFileSync(resolve(__dirname, '../app/_layout.tsx'), 'utf8');
const inbox = readFileSync(resolve(__dirname, '../app/(tabs)/notifications.tsx'), 'utf8');

/** The effect that registers the tap listener. */
const tapEffect = layout.slice(
  layout.lastIndexOf('useEffect(', layout.indexOf('addNotificationResponseReceivedListener')),
  layout.indexOf('}, [pushNavKey, authStatus]);') + '}, [pushNavKey, authStatus]);'.length,
);

describe('push tap wiring', () => {
  it('routes through the shared resolver, with no kind list of its own', () => {
    expect(layout).toContain("from '../lib/notifications/tapTarget'");
    expect(tapEffect).toContain('resolveTapRoute(input, echoIsVideo)');
    // The inline list lacked friend_post, friend_answer and social_task_update.
    expect(layout).not.toContain('VALID_KINDS');
  });

  it('waits for the navigator, which a cold start from a tap beats', () => {
    expect(tapEffect).toMatch(/if \(!pushNavKey\) return;/);
    expect(tapEffect).toContain('[pushNavKey, authStatus]');
  });

  it('opens nothing until the person is signed in, and holds the tap until then', () => {
    expect(tapEffect).toMatch(/authStatus === 'ready'/);
    expect(tapEffect).toContain('pendingPushTap');
  });

  it('never opens the same tap twice when the effect re-runs', () => {
    expect(tapEffect).toContain('lastHandledPushTap');
  });

  it('still sends a typed reply instead of navigating', () => {
    expect(tapEffect).toContain('handleNotificationReply(');
  });

  it('falls back to the inbox rather than just opening the app', () => {
    expect(tapEffect).toContain('target !== INBOX');
  });
});

describe('inbox row taps', () => {
  it('use the same resolver as the push', () => {
    expect(inbox).toContain("from '../../lib/notifications/tapTarget'");
    expect(inbox).toContain('tapRoute(input)');
    expect(inbox).toContain('resolveTapRoute(input, echoIsVideo)');
    expect(inbox).not.toContain('switch (destinationFor(');
  });
});

describe('Flow opens on a requested video', () => {
  const watch = readFileSync(resolve(__dirname, '..', 'app/(tabs)/watch.tsx'), 'utf8');

  it('reads echoId, puts that video first and drops the id on leaving', () => {
    expect(watch).toContain('useLocalSearchParams');
    expect(watch).toMatch(/\[pinnedItem, \.\.\.baseFeed\.filter\(/);
    expect(watch).toContain("router.setParams({ echoId: undefined })");
  });

  it('the tap resolver sends the route to that same tab and param', () => {
    const tapTarget = readFileSync(resolve(__dirname, '..', 'lib/notifications/tapTarget.ts'), 'utf8');
    expect(tapTarget).toContain("pathname: '/(tabs)/watch', params: { echoId: id }");
  });
});
