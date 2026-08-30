/**
 * Occasion-aware copy for personalized nudges.
 *
 * Shared between the app and the `personalized-fanout` edge function, so it
 * must stay free of Expo and Deno imports — plain TypeScript only, the same
 * contract as ./routing.ts.
 *
 * Voice: dry, self-aware, transactional. An algorithm noticed a date; it does
 * not pretend to feel anything about it. No exclamation marks, no puns, no
 * "we're thinking of you" — a notification that fakes warmth reads worse than
 * one that admits what it is. Bodies stay inside 16 words.
 *
 * Copy is static by design. Generating it per send would mean one model call
 * per recipient per hour, and the project's AI quota is a free tier of roughly
 * 20 requests/day — a single cron tick would exhaust it and the rest of the
 * cohort would silently get nothing. A batch job can refresh these pools later
 * without touching the send path.
 */

export type NudgeTrigger =
  | { kind: 'birthday' }
  | { kind: 'festival'; name: string }
  | { kind: 'surface'; surface: string };

/** Picks one variant from a list. Injected so tests are deterministic. */
export type Picker = <T>(arr: T[]) => T;

/**
 * Festivals on a fixed Gregorian date. Safe to match on month/day in any year.
 */
const FIXED_FESTIVALS: Record<string, string> = {
  '01-01': 'New Year',
  '01-14': 'Makar Sankranti',
  '01-26': 'Republic Day',
  '08-15': 'Independence Day',
  '10-02': 'Gandhi Jayanti',
  '12-25': 'Christmas',
};

/**
 * Festivals that move with the lunar calendar, keyed by exact date.
 *
 * These MUST be dated per year rather than matched on month/day: Diwali,
 * Holi and Eid shift by weeks between years, and greeting someone on the wrong
 * day is a worse failure than staying silent — which is exactly what an
 * unlisted year does here.
 *
 * VERIFY BEFORE RELYING ON THESE DATES, and extend the table each year.
 */
const MOVABLE_FESTIVALS: Record<string, string> = {
  '2026-03-04': 'Holi',
  '2026-11-08': 'Diwali',
  '2027-03-23': 'Holi',
  '2027-10-29': 'Diwali',
};

const BIRTHDAY_COPY = [
  'A database field says it is today. Nobody here knows you. Regardless: happy birthday.',
  'Your profile says today. An algorithm noticed. That is the whole story.',
  'We only have a date field, not affection. Still, it says today.',
  'Congratulations on surviving another orbit. This message was scheduled weeks ago.',
];

const FESTIVAL_COPY = [
  (name: string) => `An algorithm noticed ${name} and sent this. Go be with actual people.`,
  (name: string) => `It is ${name}. This app has no feelings about that, only a calendar.`,
  (name: string) => `${name}, apparently. Consider this the least sincere greeting you will get today.`,
  (name: string) => `Your calendar says ${name}. Ours says send notification. Both are now satisfied.`,
];

/** The `MM-DD` slice of an ISO date. */
function monthDay(isoDate: string): string {
  return isoDate.slice(5, 10);
}

/**
 * Today's calendar date in India Standard Time, as `YYYY-MM-DD`.
 *
 * For occasion triggers ONLY (birthdays, festivals) — `new
 * Date().toISOString().slice(0, 10)` reports the UTC date, which is still
 * "yesterday" between 00:00 and 05:30 IST. An occasion check running on that
 * UTC date misses the last 5.5 hours of the Indian day, which is exactly the
 * "greeting someone on the wrong day is a worse failure than staying silent"
 * mistake this file warns about above. Do not use this for the daily-question
 * lookup — that stays on the UTC date deliberately, since changing it would
 * change which question a user sees.
 */
export function istDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

/**
 * The festival falling on `today` (an ISO `YYYY-MM-DD`), or null.
 * Exact-dated movable feasts win over fixed ones when both somehow match.
 */
export function festivalOn(today: string): string | null {
  return MOVABLE_FESTIVALS[today] ?? FIXED_FESTIVALS[monthDay(today)] ?? null;
}

/**
 * Whether `today` is the user's birthday, comparing month and day only.
 *
 * A 29 February birthday matches only in a leap year. Rolling it to 1 March
 * would greet the wrong day for everyone born on 1 March, so it stays silent
 * in common years — the same "say nothing rather than say it wrong" rule the
 * movable-festival table follows.
 */
export function isBirthday(dateOfBirth: string | null | undefined, today: string): boolean {
  if (!dateOfBirth) return false;
  return monthDay(dateOfBirth) === monthDay(today);
}

/**
 * Picks the occasion for this nudge. Birthday outranks a festival, which
 * outranks the user's usual interest surface — the rarer the reason, the more
 * it earns the one notification a day this user will tolerate.
 */
export function selectTrigger(opts: {
  dateOfBirth: string | null | undefined;
  today: string;
  surface: string;
}): NudgeTrigger {
  if (isBirthday(opts.dateOfBirth, opts.today)) return { kind: 'birthday' };
  const festival = festivalOn(opts.today);
  if (festival) return { kind: 'festival', name: festival };
  return { kind: 'surface', surface: opts.surface };
}

/**
 * Body copy for an occasion trigger, or null for a surface trigger — the
 * caller owns the surface path and its existing SURFACE_COPY table.
 */
export function copyForTrigger(trigger: NudgeTrigger, pick: Picker): string | null {
  switch (trigger.kind) {
    case 'birthday':
      return pick(BIRTHDAY_COPY);
    case 'festival':
      return pick(FESTIVAL_COPY)(trigger.name);
    case 'surface':
      return null;
  }
}
