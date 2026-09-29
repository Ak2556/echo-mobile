/**
 * A channel that must use a fixed topic, because both participants have to
 * meet on it (typing broadcasts), cannot take the per-mount random suffix the
 * other channels use. realtime-js keeps one channel per topic and
 * `client.channel(topic)` hands back the registered one if it exists.
 *
 * removeChannel() only drops a channel from that registry once the server
 * acknowledges the leave (or it times out). Leave a DM thread and come back
 * before that, and the new screen is handed the old, closing channel: its
 * listener attaches, its subscribe() is a no-op, and when the leave completes
 * the channel is torn down under it. The typing indicator is then dead for
 * the whole visit.
 *
 * freshChannel() waits for any channel still registered on the topic to be
 * removed, then creates a new one. The wait is one leave round trip at most,
 * and immediate when the socket is down (the leave resolves locally).
 */
import type { RealtimeChannel, RealtimeChannelOptions } from '@supabase/supabase-js';

export type ChannelRegistry = {
  getChannels(): RealtimeChannel[];
  channel(topic: string, opts?: RealtimeChannelOptions): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
};

export async function freshChannel(
  client: ChannelRegistry,
  topic: string,
  opts?: RealtimeChannelOptions,
): Promise<RealtimeChannel> {
  const full = `realtime:${topic}`;
  const stale = client.getChannels().filter(c => c.topic === full);
  await Promise.all(stale.map(c => client.removeChannel(c).catch(() => undefined)));
  return client.channel(topic, opts);
}
