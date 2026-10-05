/**
 * Who a message must be sealed to, answered without a round trip when possible.
 *
 * A sealed 1:1 send needed three lookups before the one request that actually
 * sends it: the conversation row (to learn who the other person is), then that
 * person's registered devices, and before both, a get-or-create call for the
 * conversation id the screen already had. At 60+ ms a trip that is 200+ ms of
 * waiting before the message is confirmed, and none of it changes between two
 * messages in the same chat.
 *
 *  - Conversation membership never changes for a 1:1, so it is remembered for
 *    good.
 *  - The recipient's device list can change (a new phone, a revoked one), so it is
 *    remembered for a short time only: long enough to cover a burst of messages,
 *    short enough that a new device is picked up within seconds.
 *  - "The recipient has no device yet" is never remembered. The moment she
 *    registers one, the next send must see it, not wait out a timer.
 *  - Errors are never remembered, and a failed send drops the entry so the next
 *    attempt asks again.
 *  - In-flight lookups are shared, so a prefetch and the first send do not both
 *    go to the server.
 *
 * Pure (the server calls are injected) so the trip count can be tested.
 */

export interface ConversationInfo {
  userA: string;
  userB: string | null;
  isGroup: boolean;
}

export interface DeviceRow {
  userId: string;
  deviceId: string;
  publicKey: string;
}

export interface SendTargetsDeps {
  fetchConversation: (conversationId: string) => Promise<ConversationInfo>;
  fetchDevices: (userIds: string[]) => Promise<DeviceRow[]>;
  now?: () => number;
  deviceTtlMs?: number;
}

export interface ResolvedTargets {
  recipientId: string;
  devices: DeviceRow[];
  /** The recipient has at least one registered device. When false nothing was cached. */
  ready: boolean;
}

export const DEVICE_TTL_MS = 30_000;

export function createSendTargets(deps: SendTargetsDeps) {
  const now = deps.now ?? Date.now;
  const ttl = deps.deviceTtlMs ?? DEVICE_TTL_MS;
  const conversations = new Map<string, Promise<ConversationInfo>>();
  const devices = new Map<string, { at: number; value: Promise<DeviceRow[]> }>();

  const deviceKey = (recipientId: string, senderId: string) => `${recipientId}|${senderId}`;

  function conversation(conversationId: string): Promise<ConversationInfo> {
    let p = conversations.get(conversationId);
    if (!p) {
      p = deps.fetchConversation(conversationId);
      conversations.set(conversationId, p);
      p.catch(() => { if (conversations.get(conversationId) === p) conversations.delete(conversationId); });
    }
    return p;
  }

  function deviceList(recipientId: string, senderId: string): Promise<DeviceRow[]> {
    const key = deviceKey(recipientId, senderId);
    const hit = devices.get(key);
    if (hit && now() - hit.at < ttl) return hit.value;
    const value = deps.fetchDevices([recipientId, senderId]);
    const entry = { at: now(), value };
    devices.set(key, entry);
    value.then(
      (rows) => { if (!rows.some((d) => d.userId === recipientId) && devices.get(key) === entry) devices.delete(key); },
      () => { if (devices.get(key) === entry) devices.delete(key); },
    );
    return value;
  }

  return {
    /** null for a group or a one-sided conversation: nothing to seal here. */
    async resolve(conversationId: string, senderId: string): Promise<ResolvedTargets | null> {
      const c = await conversation(conversationId);
      if (c.isGroup || !c.userB) return null;
      const recipientId = c.userA === senderId ? c.userB : c.userA;
      const rows = await deviceList(recipientId, senderId);
      return { recipientId, devices: rows, ready: rows.some((d) => d.userId === recipientId) };
    },
    /** A send failed: do not trust what this chat's targets were. */
    invalidate(conversationId: string, senderId?: string) {
      conversations.delete(conversationId);
      if (senderId === undefined) devices.clear();
      else for (const key of devices.keys()) if (key.endsWith(`|${senderId}`)) devices.delete(key);
    },
    clear() {
      conversations.clear();
      devices.clear();
    },
  };
}
