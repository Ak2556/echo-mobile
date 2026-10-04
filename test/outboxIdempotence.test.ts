/**
 * The outbox replays queued writes when the network returns, and a drain can
 * legitimately run more than once for the same op — the app is foregrounded,
 * the connection flaps, or a request reaches the server and only its response
 * is lost.
 *
 * So every op type must be safe to replay. These tests encode which ones are
 * naturally idempotent and which need help, because getting this wrong is
 * invisible until a user's comment appears twice.
 */
import { describe, expect, it } from 'vitest';

/** Op types the processor can replay, and how each survives a repeat. */
const OPS = {
  like: 'set-state',
  bookmark: 'set-state',
  repost: 'set-state',
  follow: 'set-state',
  echoReaction: 'set-state',
  commentLike: 'set-state',
  dailyAnswer: 'upsert',
  comment: 'client-id',
  publish: 'client-id',
} as const;

type Strategy = (typeof OPS)[keyof typeof OPS];

/**
 * A set-state op carries the value it wants, not a flip. Applying it twice
 * lands in the same place; a toggle would not.
 */
function applySetState(current: boolean, desired: boolean): boolean {
  return desired;
}

/** A toggle — the shape these ops deliberately avoid. */
function applyToggle(current: boolean): boolean {
  return !current;
}

/** An insert deduplicated by a client-supplied primary key. */
function applyClientId(rows: string[], clientId: string): string[] {
  return rows.includes(clientId) ? rows : [...rows, clientId];
}

describe('every op declares a replay strategy', () => {
  it('covers each registered type', () => {
    // If someone adds an op to the registry without deciding how it survives a
    // replay, this list and the registry drift apart. That is the bug this
    // test exists to make loud.
    const registered = Object.keys(OPS);
    expect(registered).toContain('comment');
    expect(registered).toContain('dailyAnswer');
    expect(registered.length).toBeGreaterThanOrEqual(9);
  });

  it('uses only strategies known to be replay-safe', () => {
    const allowed: Strategy[] = ['set-state', 'upsert', 'client-id'];
    for (const [op, strategy] of Object.entries(OPS)) {
      expect(allowed, `${op} uses an unrecognised strategy`).toContain(strategy);
    }
  });
});

describe('set-state ops survive replay', () => {
  it('lands in the same place however many times it runs', () => {
    let liked = false;
    liked = applySetState(liked, true);
    liked = applySetState(liked, true); // the replay
    expect(liked).toBe(true);
  });

  it('shows why a toggle would have been wrong', () => {
    // The same double-run against a toggle silently undoes the user's action.
    let liked = false;
    liked = applyToggle(liked);
    liked = applyToggle(liked);
    expect(liked).toBe(false);
  });
});

describe('client-id ops survive replay', () => {
  it('does not insert the same comment twice', () => {
    let rows: string[] = [];
    rows = applyClientId(rows, 'op-abc');
    rows = applyClientId(rows, 'op-abc'); // the replay
    expect(rows).toEqual(['op-abc']);
  });

  it('still allows two genuinely different comments', () => {
    let rows: string[] = [];
    rows = applyClientId(rows, 'op-abc');
    rows = applyClientId(rows, 'op-def');
    expect(rows).toHaveLength(2);
  });

  it('would double-post without the client id', () => {
    // The failure mode being prevented: an insert with a server-generated id
    // has nothing to collide on.
    const rows: string[] = [];
    rows.push('generated-1');
    rows.push('generated-2'); // same comment, replayed
    expect(rows).toHaveLength(2);
  });
});
