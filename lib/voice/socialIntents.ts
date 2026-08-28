import { router } from 'expo-router';
import { persistSet } from '../../store/persist';
import { searchRemoteUsers, getOrCreateRemoteConversation } from '../supabaseEchoApi';
import { parseSendMessage } from './parseMessage';
import { pickPerson, type PersonHit } from './pickPerson';

/**
 * Voice intents that have to talk to the server before they can act.
 *
 * Everything dispatch handles today is instant and local — navigate, toggle,
 * scroll — so `dispatchVoiceIntent` is synchronous. Messaging is the first
 * intent that needs a lookup: a spoken name has to become an account, and an
 * account has to become a conversation. Rather than make every intent async for
 * the sake of one, these live here and the caller tries them first.
 *
 * Nothing here sends. The message is written into the thread's draft and the
 * thread is opened, so the last step is a deliberate tap. Name matching is
 * fuzzy by nature and a sent DM cannot be recalled; putting the send under the
 * user's thumb costs one tap and removes the only failure that really hurts.
 */

export interface SocialOutcome {
  handled: boolean;
  reply: string;
  /** True when the reply has already been spoken by the caller's TTS. */
  spoken?: boolean;
}

/** How the DM screen stores a per-conversation draft (app/messages/[id].tsx). */
const draftKey = (conversationId: string) => `chat:draft:${conversationId}`;

/**
 * Try to handle the transcript as a messaging command.
 * Returns null when it isn't one, so the caller falls through to normal
 * dispatch and then to the model.
 */
export async function trySocialIntent(transcript: string): Promise<SocialOutcome | null> {
  const parsed = parseSendMessage(transcript);
  if (!parsed) return null;

  let hits: PersonHit[] = [];
  try {
    hits = (await searchRemoteUsers(parsed.recipient, 8)) as PersonHit[];
  } catch {
    return { handled: false, reply: `Could not look up ${parsed.recipient}.` };
  }

  const picked = pickPerson(hits, parsed.recipient);

  if (picked.kind === 'none') {
    // Send them somewhere useful rather than failing flat: the search screen
    // with the name already entered.
    router.push({ pathname: '/(tabs)/explore', params: { q: parsed.recipient } });
    return { handled: true, reply: `No one called ${parsed.recipient}. Here's the search.` };
  }

  if (picked.kind === 'ambiguous') {
    router.push({ pathname: '/(tabs)/explore', params: { q: parsed.recipient } });
    const names = picked.candidates.map(c => c.display_name || c.username).join(', ');
    return { handled: true, reply: `More than one match: ${names}. Pick one.` };
  }

  const person = picked.person;
  let conversationId: string;
  try {
    conversationId = await getOrCreateRemoteConversation(person.id);
  } catch {
    return { handled: false, reply: `Could not open a chat with ${person.display_name || person.username}.` };
  }

  // Pre-fill rather than send. The thread reads this key on mount and on focus.
  if (parsed.text) {
    try {
      persistSet(draftKey(conversationId), parsed.text);
    } catch {
      // A failed draft write is not worth abandoning the navigation for — the
      // user still lands in the right conversation and can type.
    }
  }

  router.push({ pathname: '/messages/[id]', params: { id: conversationId } });

  const who = person.display_name || person.username;
  return {
    handled: true,
    reply: parsed.text ? `Ready to send to ${who}. Tap send.` : `Opened your chat with ${who}.`,
  };
}
