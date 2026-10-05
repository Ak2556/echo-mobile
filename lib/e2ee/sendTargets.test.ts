import { describe, expect, it, vi } from 'vitest';
import { createSendTargets, type DeviceRow } from './sendTargets';

const ALICE = 'u-alice';
const BOB = 'u-bob';
const dev = (userId: string): DeviceRow => ({ userId, deviceId: `d-${userId}`, publicKey: 'pk' });

function setup(over: { devices?: () => Promise<DeviceRow[]>; conversation?: () => Promise<{ userA: string; userB: string | null; isGroup: boolean }> } = {}) {
  let t = 1_000;
  const fetchConversation = vi.fn(over.conversation ?? (async () => ({ userA: ALICE, userB: BOB, isGroup: false })));
  const fetchDevices = vi.fn(over.devices ?? (async () => [dev(ALICE), dev(BOB)]));
  const targets = createSendTargets({ fetchConversation, fetchDevices, now: () => t, deviceTtlMs: 30_000 });
  return { targets, fetchConversation, fetchDevices, advance: (ms: number) => { t += ms; } };
}

describe('trips per send', () => {
  it('the first send asks twice (conversation, devices); every send after it asks nothing', async () => {
    const s = setup();
    await s.targets.resolve('c1', ALICE);
    expect(s.fetchConversation).toHaveBeenCalledTimes(1);
    expect(s.fetchDevices).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) await s.targets.resolve('c1', ALICE);
    expect(s.fetchConversation).toHaveBeenCalledTimes(1);
    expect(s.fetchDevices).toHaveBeenCalledTimes(1);
  });

  it('after a prefetch the first send asks nothing, and a prefetch racing a send shares one request', async () => {
    const s = setup();
    const [a, b] = await Promise.all([s.targets.resolve('c1', ALICE), s.targets.resolve('c1', ALICE)]);
    expect(a?.ready && b?.ready).toBe(true);
    expect(s.fetchConversation).toHaveBeenCalledTimes(1);
    expect(s.fetchDevices).toHaveBeenCalledTimes(1);
  });

  it('devices are re-asked after the TTL, the conversation never is', async () => {
    const s = setup();
    await s.targets.resolve('c1', ALICE);
    s.advance(29_000); await s.targets.resolve('c1', ALICE);
    expect(s.fetchDevices).toHaveBeenCalledTimes(1);
    s.advance(2_000); await s.targets.resolve('c1', ALICE);
    expect(s.fetchDevices).toHaveBeenCalledTimes(2);
    expect(s.fetchConversation).toHaveBeenCalledTimes(1);
  });
});

describe('what is resolved', () => {
  it('names the other person whichever side of the conversation the sender is', async () => {
    const s = setup();
    expect((await s.targets.resolve('c1', ALICE))?.recipientId).toBe(BOB);
    expect((await s.targets.resolve('c1', BOB))?.recipientId).toBe(ALICE);
  });

  it('a group, or a one-sided conversation, has nothing to seal', async () => {
    const group = setup({ conversation: async () => ({ userA: ALICE, userB: null, isGroup: true }) });
    expect(await group.targets.resolve('g', ALICE)).toBeNull();
    expect(group.fetchDevices).not.toHaveBeenCalled();
    const lone = setup({ conversation: async () => ({ userA: ALICE, userB: null, isGroup: false }) });
    expect(await lone.targets.resolve('c', ALICE)).toBeNull();
  });
});

describe('what must never be remembered', () => {
  it('"recipient has no device" is not cached: the next send sees her new device at once', async () => {
    let registered = false;
    const s = setup({ devices: async () => (registered ? [dev(ALICE), dev(BOB)] : [dev(ALICE)]) });
    expect((await s.targets.resolve('c1', ALICE))?.ready).toBe(false);
    registered = true; // she signs in on a current build
    expect((await s.targets.resolve('c1', ALICE))?.ready).toBe(true);
    expect(s.fetchDevices).toHaveBeenCalledTimes(2);
  });

  it('a failed lookup is not cached', async () => {
    let fail = true;
    const s = setup({ devices: async () => { if (fail) throw new Error('offline'); return [dev(ALICE), dev(BOB)]; } });
    await expect(s.targets.resolve('c1', ALICE)).rejects.toThrow('offline');
    fail = false;
    expect((await s.targets.resolve('c1', ALICE))?.ready).toBe(true);
    expect(s.fetchDevices).toHaveBeenCalledTimes(2);
  });

  it('a failed conversation lookup is not cached either', async () => {
    let fail = true;
    const s = setup({ conversation: async () => { if (fail) throw new Error('offline'); return { userA: ALICE, userB: BOB, isGroup: false }; } });
    await expect(s.targets.resolve('c1', ALICE)).rejects.toThrow('offline');
    fail = false;
    expect(await s.targets.resolve('c1', ALICE)).not.toBeNull();
  });

  it('a failed send drops what it used, so the next attempt asks again', async () => {
    const s = setup();
    await s.targets.resolve('c1', ALICE);
    s.targets.invalidate('c1', ALICE);
    await s.targets.resolve('c1', ALICE);
    expect(s.fetchConversation).toHaveBeenCalledTimes(2);
    expect(s.fetchDevices).toHaveBeenCalledTimes(2);
  });

  it('one account\'s cache is never used for another', async () => {
    const s = setup();
    await s.targets.resolve('c1', ALICE);
    await s.targets.resolve('c1', BOB);
    expect(s.fetchDevices).toHaveBeenCalledTimes(2);
  });
});
