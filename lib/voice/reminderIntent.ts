/**
 * "Remind me to call Ma at seven tomorrow", matched on the device.
 *
 * The page promises that saying it sets the reminder. Sentences like this are long, so the
 * local matcher's word cap would send them to the model, which has no reminder action and
 * guesses. An explicit prefix (or the Hindi suffix "... yaad dilana") plus a non-empty
 * remainder is as safe as dictation is, and it never needs the network: the remainder goes
 * to the Tasks mini-app, which parses the day and time and asks before it sets anything.
 */

const PREFIX = /^(?:please\s+)?(?:remind me|set (?:a )?reminder)(?:\s+(?:to|that|for|about))?\s+(.+)$/i;
const ROMAN_SUFFIX = /^(?:mujhe\s+)?(.+?)\s+yaad\s+dila(?:na|o|do|dena)$/i;
const DEVANAGARI_SUFFIX = /^(?:मुझे\s+)?(.+?)\s+याद\s+दिला(?:ना|ओ|दो|देना)$/;

export function matchReminder(transcript: string): { text: string } | null {
  const raw = transcript.trim().replace(/[.!?।]+$/, '');
  for (const re of [PREFIX, ROMAN_SUFFIX, DEVANAGARI_SUFFIX]) {
    const m = raw.match(re);
    if (m && m[1].trim().length > 1) return { text: raw };
  }
  return null;
}
