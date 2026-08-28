/**
 * Choosing which account a spoken name refers to.
 *
 * This is the sharp edge of voice messaging. Search returns several people who
 * all look plausible, the user said one word, and picking the wrong one puts a
 * private message in front of a stranger. So the rule here is that ambiguity is
 * an answer: when two candidates are equally good, this returns null and the
 * caller shows the list instead of guessing.
 */

export interface PersonHit {
  id: string;
  username: string;
  display_name: string;
}

export type PickResult =
  /** One clear winner. */
  | { kind: 'match'; person: PersonHit }
  /** Several equally plausible — the caller should let the user choose. */
  | { kind: 'ambiguous'; candidates: PersonHit[] }
  /** Nobody looked close enough. */
  | { kind: 'none' };

function norm(s: string): string {
  return (s ?? '').trim().toLowerCase().replace(/^@/, '');
}

/**
 * Higher is better. The gap between tiers is deliberately wide so a weaker kind
 * of match can never tie with a stronger one.
 */
function score(hit: PersonHit, spoken: string): number {
  const q = norm(spoken);
  const username = norm(hit.username);
  const display = norm(hit.display_name);
  if (!q) return 0;

  if (username === q) return 100;      // exact handle — unambiguous by definition
  if (display === q) return 90;        // exact display name
  // First name of a display name: "Kav" for "Kav Sharma".
  if (display.split(/\s+/)[0] === q) return 70;
  if (username.startsWith(q)) return 50;
  if (display.startsWith(q)) return 45;
  if (username.includes(q) || display.includes(q)) return 20;
  return 0;
}

/** Below this a "match" is really a coincidence of shared letters. */
const MIN_SCORE = 20;

export function pickPerson(hits: PersonHit[], spoken: string): PickResult {
  const q = norm(spoken);
  if (!q || !hits?.length) return { kind: 'none' };

  const scored = hits
    .map(person => ({ person, s: score(person, q) }))
    .filter(x => x.s >= MIN_SCORE)
    .sort((a, b) => b.s - a.s);

  if (!scored.length) return { kind: 'none' };

  const best = scored[0];
  const tied = scored.filter(x => x.s === best.s);

  // An exact handle match is unique by construction, so a tie there means the
  // data is odd — still safer to ask than to pick.
  if (tied.length > 1) {
    return { kind: 'ambiguous', candidates: tied.map(x => x.person) };
  }

  return { kind: 'match', person: best.person };
}
