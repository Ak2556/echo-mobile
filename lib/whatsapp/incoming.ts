/**
 * Reading a WhatsApp Cloud API webhook.
 *
 * Meta's payload is nested five deep and batches unrelated things together:
 * one POST can carry several entries, each with several changes, each holding
 * messages *and* delivery statuses. Statuses outnumber messages in practice, so
 * anything that treats "a webhook arrived" as "someone said something" will
 * answer read receipts.
 *
 * Kept pure and separate from the edge function so the shapes can be tested
 * against real payload examples without a network or a Deno runtime.
 */

export type IncomingKind = 'text' | 'audio' | 'image' | 'unsupported';

export interface IncomingMessage {
  /** Meta's per-message id; the key for not answering the same thing twice. */
  id: string;
  /** Sender, digits only, country code included. */
  waId: string;
  /** Display name from the sender's WhatsApp profile, when Meta includes it. */
  profileName: string | null;
  kind: IncomingKind;
  /** Text body, or the caption on media. */
  text: string;
  /** Media id to fetch from the Graph API, for audio and image. */
  mediaId: string | null;
  /** Seconds since epoch, as Meta sends it. */
  timestamp: number;
}

type Json = Record<string, unknown>;

const asArray = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const asObj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});

/**
 * Every genuine message in a webhook body, in arrival order.
 *
 * Delivery statuses, reactions, and message types Echo cannot act on are
 * dropped here rather than deeper in, so the caller only ever sees things a
 * person actually sent.
 */
export function parseIncoming(body: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const root = asObj(body);
  if (root.object !== 'whatsapp_business_account') return out;

  for (const entry of asArray(root.entry)) {
    for (const change of asArray(entry.changes)) {
      const value = asObj(asObj(change).value);

      // Names arrive alongside the messages, keyed by wa_id.
      const names = new Map<string, string>();
      for (const contact of asArray(value.contacts)) {
        const waId = typeof contact.wa_id === 'string' ? contact.wa_id : '';
        const name = asObj(contact.profile).name;
        if (waId && typeof name === 'string') names.set(waId, name);
      }

      for (const raw of asArray(value.messages)) {
        const id = typeof raw.id === 'string' ? raw.id : '';
        const from = typeof raw.from === 'string' ? raw.from : '';
        if (!id || !from) continue;

        const type = typeof raw.type === 'string' ? raw.type : '';
        let kind: IncomingKind = 'unsupported';
        let text = '';
        let mediaId: string | null = null;

        if (type === 'text') {
          kind = 'text';
          text = String(asObj(raw.text).body ?? '');
        } else if (type === 'audio' || type === 'voice') {
          // A voice note is the reason this channel is worth having in India,
          // so it is a first-class kind rather than "unsupported media".
          kind = 'audio';
          const audio = asObj(raw.audio ?? raw.voice);
          mediaId = typeof audio.id === 'string' ? audio.id : null;
        } else if (type === 'image') {
          kind = 'image';
          const image = asObj(raw.image);
          mediaId = typeof image.id === 'string' ? image.id : null;
          text = String(image.caption ?? '');
        }

        out.push({
          id,
          waId: from,
          profileName: names.get(from) ?? null,
          kind,
          text,
          mediaId,
          timestamp: Number(raw.timestamp ?? 0) || 0,
        });
      }
    }
  }

  return out;
}

/**
 * Meta's verification handshake.
 *
 * Answered with the challenge only when the token matches, because echoing it
 * unconditionally would let anyone point their own webhook subscription here.
 */
export function verifyHandshake(
  params: URLSearchParams,
  expectedToken: string,
): { ok: true; challenge: string } | { ok: false } {
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
    return { ok: true, challenge };
  }
  return { ok: false };
}
