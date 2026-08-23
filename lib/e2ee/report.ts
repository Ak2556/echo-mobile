/**
 * Reporting an end-to-end encrypted message.
 *
 * Echo cannot read direct messages, so it cannot moderate them on the server.
 * The recipient can — they hold the key — so reporting works by disclosure:
 * the reporter's device decrypts the message it is reporting and submits that
 * plaintext as evidence.
 *
 * The distinction that makes this acceptable rather than a backdoor:
 *   · only a participant can do it, because only they can decrypt
 *   · only the messages they pick are revealed, never the whole thread
 *   · nothing is disclosed unless a person taps report
 *
 * Pure and device-free, like crypto.ts — decryption is injected, so the whole
 * thing is testable without a keystore.
 */

import type { WrappedKey } from './crypto';

/** How many surrounding messages accompany the reported one. */
export const MAX_CONTEXT_MESSAGES = 10;

/** Longest disclosed body; anything past this is truncated with a marker. */
export const MAX_DISCLOSED_CHARS = 4000;

export interface EncryptedRecord {
  id: string;
  senderId: string;
  createdAt: string;
  ciphertext: string;
  nonce: string;
  encryptionVersion?: number | null;
  /** This device's wrapped key for the message, if it has one. */
  ownKey?: WrappedKey | null;
}

export interface DisclosedMessage {
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Disclosure {
  targetType: 'dm_message';
  disclosedMessageId: string;
  disclosedContent: string;
  disclosedContext: DisclosedMessage[];
}

/** Decrypts one record, or explains why it could not be read. */
export type Decryptor = (record: EncryptedRecord) => string;

export class DisclosureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DisclosureError';
  }
}

function truncate(body: string): string {
  if (body.length <= MAX_DISCLOSED_CHARS) return body;
  return `${body.slice(0, MAX_DISCLOSED_CHARS)}\n\n[truncated — original was ${body.length} characters]`;
}

/**
 * Build the evidence for a report.
 *
 * `thread` should be the messages already loaded in the conversation view;
 * this picks a bounded window around the reported one rather than reaching for
 * more. A message that fails to decrypt is included as a marker, not silently
 * dropped — a gap in the transcript would mislead a moderator as much as a
 * missing message would.
 *
 * Returns exactly what will be sent, so the UI can show the user their own
 * disclosure before they confirm it. Nothing should ever be submitted that the
 * reporter has not been shown.
 */
export function buildDisclosure(
  targetMessageId: string,
  thread: EncryptedRecord[],
  decrypt: Decryptor,
): Disclosure {
  const index = thread.findIndex(m => m.id === targetMessageId);
  if (index === -1) {
    throw new DisclosureError('That message is not in this conversation');
  }

  const target = thread[index];
  let disclosedContent: string;
  try {
    disclosedContent = truncate(decrypt(target));
  } catch {
    throw new DisclosureError(
      'This message cannot be read on this device, so it cannot be reported from here.',
    );
  }

  // A window centred on the reported message: what came before gives intent,
  // what came after gives reaction.
  const half = Math.floor(MAX_CONTEXT_MESSAGES / 2);
  const start = Math.max(0, index - half);
  const context = thread.slice(start, start + MAX_CONTEXT_MESSAGES);

  const disclosedContext: DisclosedMessage[] = context.map(record => {
    let body: string;
    try {
      body = truncate(decrypt(record));
    } catch {
      body = '[could not be decrypted on the reporting device]';
    }
    return { sender_id: record.senderId, body, created_at: record.createdAt };
  });

  return {
    targetType: 'dm_message',
    disclosedMessageId: target.id,
    disclosedContent,
    disclosedContext,
  };
}

/**
 * One-line summary for the confirmation sheet.
 *
 * Reporting is the only path by which Echo ever sees a private message, so the
 * user is told plainly what leaves their device — not buried in a policy.
 */
export function describeDisclosure(disclosure: Disclosure): string {
  const others = disclosure.disclosedContext.length;
  return others > 1
    ? `The reported message and ${others - 1} surrounding messages will be sent to Echo's moderators.`
    : 'The reported message will be sent to Echo’s moderators.';
}
