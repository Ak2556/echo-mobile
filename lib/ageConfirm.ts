import { checkDateOfBirth, type AgeCheck } from '../constants/legal/ageGate';

/**
 * Day / month / year text fields → an age check and the ISO date to save.
 * Same rules as the sign-up wizard's date step: a date the calendar would roll
 * over (31 February) is implausible rather than silently moved.
 */
export function parseDobFields(day: string, month: string, year: string): { check: AgeCheck | null; iso: string | null } {
  if (day.length < 1 || month.length < 1 || year.length < 4) return { check: null, iso: null };
  const d = Number(day), m = Number(month), y = Number(year);
  if (!d || !m || !y) return { check: null, iso: null };
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    return { check: { ok: false, reason: 'implausible', age: null }, iso: null };
  }
  const check = checkDateOfBirth(parsed);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { check, iso: check.ok ? `${y}-${pad(m)}-${pad(d)}` : null };
}

/**
 * Whether to put the birthday card in front of the app.
 *
 * Only when the server has positively answered "no date of birth on file"
 * (age === null after a successful fetch). A failed or pending check shows
 * nothing and is retried next launch: a network hiccup must never lock
 * someone out of the app.
 */
export function shouldAskForAge(s: { signedIn: boolean; fetched: boolean; age: number | null | undefined }): boolean {
  return s.signedIn && s.fetched && s.age === null;
}
