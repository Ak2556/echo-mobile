/**
 * Turning a stored row into something the UI can render.
 *
 * Pure, like crypto.ts: it imports no device or network module, so the state
 * machine that decides whether a message is readable can be tested directly
 * rather than through stubs. messages.ts supplies the keys and re-exports
 * these for callers.
 */

import { DecryptionError, decryptMessage, type WrappedKey } from './crypto';

/** What the UI renders for one message. */
export type ReadableMessage =
  | { state: 'plaintext'; body: string }
  | { state: 'decrypted'; body: string }
  | { state: 'unreadable'; reason: string };

export interface StoredMessage {
  id: string;
  text?: string | null;
  ciphertext?: string | null;
  nonce?: string | null;
  encryption_version?: number | null;
}

/**
 * Resolve one stored row.
 *
 * Returns a state rather than throwing, because a single unreadable message
 * must not blank the whole thread — but it is never silently replaced with an
 * empty string either. The user is told which message they cannot read and
 * why, which is nearly always "sent to a device you no longer have".
 */
export function readMessage(
  message: StoredMessage,
  ownKey: WrappedKey | undefined,
  secretKey: string,
): ReadableMessage {
  if (!message.ciphertext) {
    // Predates encryption, or is a non-text kind carrying no body.
    return { state: 'plaintext', body: message.text ?? '' };
  }
  if (!ownKey) {
    return { state: 'unreadable', reason: 'This message was encrypted for a different device.' };
  }

  try {
    return {
      state: 'decrypted',
      body: decryptMessage(
        {
          ciphertext: message.ciphertext,
          nonce: message.nonce ?? '',
          encryptionVersion: message.encryption_version,
        },
        ownKey,
        secretKey,
      ),
    };
  } catch (err) {
    return {
      state: 'unreadable',
      reason: err instanceof DecryptionError ? err.message : 'This message could not be decrypted.',
    };
  }
}
