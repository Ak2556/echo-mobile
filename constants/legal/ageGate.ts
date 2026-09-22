/**
 * Age policy — the client half of the age gate.
 *
 * The authoritative copies of these thresholds live in Postgres
 * (`minimum_age_years()` / `adult_age_years()` in the 20260822140000_age_gate
 * migration) because the client cannot be trusted to report its own age. These
 * constants exist so the UI can validate before a round trip and explain the
 * rule to the user; they must be kept in step with the SQL.
 *
 * DECIDED 2026-09-22: 18+. India's DPDP Act 2023 treats everyone under 18 as
 * a child requiring verifiable parental consent. Echo launches India-first and
 * does not build a parental-consent flow, so it does not admit under-18s. The
 * SQL side is 20260922130000_launch_legal_gaps.sql; lib/ageGate.test.ts fails
 * if the two ever disagree.
 *
 * To admit 16-17s later: build verifiable parental consent first, then lower
 * both. Profiling and ads stay off under ADULT_AGE either way.
 */

/** Minimum age to hold an Echo account at all (Terms of Service §2). */
export const MINIMUM_AGE = 18;

/**
 * The age at which DPDP stops treating a user as a child. Below this, Echo
 * serves no targeted advertising and performs no behavioural profiling.
 */
export const ADULT_AGE = 18;

/** Whole years between `dob` and `on` (defaults to today). */
export function ageInYears(dob: Date, on: Date = new Date()): number {
  let age = on.getFullYear() - dob.getFullYear();
  const monthDelta = on.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export type AgeRejection = 'too-young' | 'implausible' | 'future';

export type AgeCheck =
  | { ok: true; age: number; isAdult: boolean }
  | { ok: false; reason: AgeRejection; age: number | null };

/**
 * Validate a self-declared date of birth. Mirrors the SQL trigger so the user
 * gets an immediate answer, not a round trip and a raw Postgres error.
 */
export function checkDateOfBirth(dob: Date, on: Date = new Date()): AgeCheck {
  if (Number.isNaN(dob.getTime())) return { ok: false, reason: 'implausible', age: null };
  if (dob > on) return { ok: false, reason: 'future', age: null };

  const age = ageInYears(dob, on);
  if (age > 120) return { ok: false, reason: 'implausible', age };
  if (age < MINIMUM_AGE) return { ok: false, reason: 'too-young', age };

  return { ok: true, age, isAdult: age >= ADULT_AGE };
}

/** User-facing explanation for a rejected date of birth. */
export function ageRejectionMessage(reason: AgeRejection): string {
  switch (reason) {
    case 'too-young':
      return `You need to be at least ${MINIMUM_AGE} to use Echo.`;
    case 'future':
      return 'That date is in the future.';
    case 'implausible':
    default:
      return 'Please enter a valid date of birth.';
  }
}
