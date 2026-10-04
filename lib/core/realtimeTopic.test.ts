import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { freshChannel, type ChannelRegistry } from './realtimeTopic';

/**
 * Mirrors realtime-js 2.x: one channel per topic, channel() returns the
 * registered one if present, and a channel leaves the registry only when its
 * leave is acknowledged. Acks are released by the test.
 */
function fakeRealtime() {
  let registry: { topic: string; id: number }[] = [];
  let next = 1;
  const pendingAcks: (() => void)[] = [];
  const client: ChannelRegistry = {
    getChannels: () => registry as unknown as RealtimeChannel[],
    channel: (topic: string) => {
      const full = `realtime:${topic}`;
      const existing = registry.find(c => c.topic === full);
      if (existing) return existing as unknown as RealtimeChannel;
      const ch = { topic: full, id: next++ };
      registry.push(ch);
      return ch as unknown as RealtimeChannel;
    },
    removeChannel: (ch: RealtimeChannel) => new Promise(done => {
      pendingAcks.push(() => {
        registry = registry.filter(c => c !== (ch as unknown as { topic: string; id: number }));
        done('ok');
      });
    }),
  };
  const ackAll = () => { while (pendingAcks.length) pendingAcks.shift()!(); };
  return { client, ackAll, registered: () => registry.length };
}

const idOf = (c: RealtimeChannel) => (c as unknown as { id: number }).id;

describe('freshChannel', () => {
  it('the bug: a quick return is handed the previous visit\'s closing channel', () => {
    const { client } = fakeRealtime();
    const first = client.channel('typing:c1');
    void client.removeChannel(first);            // leaving the thread; ack not back yet
    const second = client.channel('typing:c1');  // coming straight back
    expect(idOf(second)).toBe(idOf(first));
  });

  it('waits for the closing channel to leave, then returns a new one', async () => {
    const { client, ackAll } = fakeRealtime();
    const first = client.channel('typing:c1');
    void client.removeChannel(first);

    let settled = false;
    const pending = freshChannel(client, 'typing:c1').then(c => { settled = true; return c; });
    await Promise.resolve();
    expect(settled).toBe(false);                 // still waiting on the leave

    ackAll();
    const second = await pending;
    expect(idOf(second)).not.toBe(idOf(first));
  });

  it('with nothing registered, creates straight away and removes nothing', async () => {
    const { client, registered } = fakeRealtime();
    const ch = await freshChannel(client, 'typing:c2');
    expect(idOf(ch)).toBe(1);
    expect(registered()).toBe(1);
  });

  it('leaves other topics alone', async () => {
    const { client, ackAll } = fakeRealtime();
    const other = client.channel('typing:other');
    const pending = freshChannel(client, 'typing:c3');
    ackAll();
    await pending;
    expect(client.getChannels().map(idOf)).toContain(idOf(other));
  });

  it('a failed removal does not block the new channel', async () => {
    const { client } = fakeRealtime();
    client.channel('typing:c4');
    const failing: ChannelRegistry = { ...client, removeChannel: () => Promise.reject(new Error('socket gone')) };
    await expect(freshChannel(failing, 'typing:c4')).resolves.toBeDefined();
  });
});

describe('useTypingIndicator', () => {
  const src = readFileSync(resolve(__dirname, '../../hooks/queries/useDMs.ts'), 'utf8');
  const hook = src.slice(src.indexOf('export function useTypingIndicator'));

  it('gets its fixed-topic channel through freshChannel', () => {
    expect(hook).toMatch(/freshChannel\(supabase, `typing:\$\{conversationId\}`/);
    expect(hook).not.toMatch(/supabase\.channel\(`typing:/);
  });

  it('never subscribes after unmounting while it waited', () => {
    expect(hook).toMatch(/if \(cancelled\) \{ void supabase\.removeChannel\(ch\); return; \}/);
  });
});
