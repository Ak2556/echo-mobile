/**
 * Pulling a recipient and a message out of a spoken sentence.
 *
 * Every other voice command is a fixed phrase — "go home", "open notes" — so
 * matching whole phrases was enough. Messaging is the first intent with real
 * arguments in it: who, and what to say. "Message Kav saying I'm running late"
 * has to come apart into a name and a body, and people say it a dozen ways.
 *
 * Conservative on purpose. A wrong split here either messages the wrong person
 * or sends the wrong words, so anything that does not clearly separate the two
 * returns null and the model handles it instead.
 */

export interface ParsedMessage {
  /** The spoken name. Still needs resolving against real accounts. */
  recipient: string;
  /** What to say. Empty when the user named someone but said nothing to send. */
  text: string;
}

/**
 * Ordered most specific first. Each must capture recipient then body.
 *
 * The separators are the words people actually use to switch from naming
 * someone to addressing them — "saying", "that", "about", Hindi "ko ... bolo".
 */
const PATTERNS: RegExp[] = [
  // "send a message to Kav saying I'm running late"
  /^(?:send\s+)?(?:a\s+)?(?:message|msg|dm|text)\s+(?:to\s+)?(.+?)\s+(?:saying|that|about)\s+(.+)$/i,
  // "message Kav I'm running late" — one word for the name. Without a separator
  // word there is nothing marking where the name ends, and taking two words
  // turns "message Kav I will be there" into a person called "Kav I".
  /^(?:send\s+)?(?:a\s+)?(?:message|msg|dm|text)\s+(?:to\s+)?([^\s]+)\s+(.+)$/i,
  // "tell Kav that I'm running late"  /  "tell Kav I'm running late"
  /^tell\s+(.+?)\s+(?:that\s+|saying\s+)?(.+)$/i,
  // "ask Kav if he is coming"
  /^ask\s+(.+?)\s+(?:if\s+|whether\s+)?(.+)$/i,
  // Hindi romanised: "Kav ko bolo main late hoon"
  /^(.+?)\s+ko\s+(?:bolo|kaho|message\s+karo)\s+(.+)$/i,
  // Hindi Devanagari: "कव को बोलो मैं लेट हूँ"
  /^(.+?)\s+को\s+(?:बोलो|कहो)\s+(.+)$/i,
];

/** Name only, no body — "message Kav", "open a chat with Kav". */
const RECIPIENT_ONLY: RegExp[] = [
  /^(?:send\s+)?(?:a\s+)?(?:message|msg|dm|text)\s+(?:to\s+)?(.+)$/i,
  /^(?:open\s+)?(?:a\s+)?(?:chat|conversation)\s+with\s+(.+)$/i,
];

/** Leading filler the recogniser leaves in, and trailing punctuation. */
function clean(s: string): string {
  return s
    .trim()
    .replace(/^(?:please\s+|can\s+you\s+|could\s+you\s+)/i, '')
    .replace(/[.,!?;:]+$/, '')
    .trim();
}

/** A name is short. A long capture means the split landed in the wrong place. */
const MAX_NAME_WORDS = 3;

/**
 * Not a person: pronouns, self-reference, and collective nouns. Checked against
 * the first word as well as the whole capture, or "message me hello" slips
 * through as a contact named "me hello".
 */
const NOT_A_PERSON = /^(me|myself|my|him|her|them|they|someone|somebody|anyone|anybody|everyone|everybody|all|us|we|you)$/i;

function plausibleName(name: string): boolean {
  if (!name) return false;
  const words = name.split(/\s+/);
  if (words.length > MAX_NAME_WORDS) return false;
  if (NOT_A_PERSON.test(name)) return false;
  return !NOT_A_PERSON.test(words[0]);
}

export function parseSendMessage(transcript: string): ParsedMessage | null {
  const input = clean(transcript);
  if (!input) return null;

  for (const re of PATTERNS) {
    const m = input.match(re);
    if (!m) continue;
    const recipient = clean(m[1] ?? '').replace(/^@/, '');
    const text = clean(m[2] ?? '');
    if (plausibleName(recipient) && text) return { recipient, text };
  }

  for (const re of RECIPIENT_ONLY) {
    const m = input.match(re);
    if (!m) continue;
    const recipient = clean(m[1] ?? '').replace(/^@/, '');
    // Only when what remains really is just a name. Two words at most here:
    // more than that and a body was meant to follow and has been swallowed.
    if (plausibleName(recipient) && recipient.split(/\s+/).length <= 2) {
      return { recipient, text: '' };
    }
  }

  return null;
}
