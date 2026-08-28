import { describe, expect, it } from 'vitest';
import { formatWaId, sameNumber, toWaId } from './phone';

/**
 * The four ways an Indian number gets written are one person. If these
 * disagree, an inbound WhatsApp message from a real user resolves to nobody
 * and they get treated as a stranger.
 */
describe('toWaId', () => {
  it('treats every common Indian spelling of one number as the same', () => {
    const expected = '919876543210';
    for (const written of [
      '9876543210',
      '09876543210',
      '+91 98765 43210',
      '+919876543210',
      '91-9876543210',
      '0091 9876543210',
      '  919876543210  ',
    ]) {
      expect(toWaId(written), `failed for ${written}`).toBe(expected);
    }
  });

  it('leaves an already-normalised wa_id alone', () => {
    expect(toWaId('919876543210')).toBe('919876543210');
  });

  it('keeps foreign numbers intact', () => {
    expect(toWaId('+1 415 555 0123')).toBe('14155550123');
    expect(toWaId('+44 20 7946 0958')).toBe('442079460958');
  });

  it('refuses what cannot be a phone number instead of guessing', () => {
    // A half-normalised string here would match the wrong account.
    expect(toWaId('')).toBeNull();
    expect(toWaId(null)).toBeNull();
    expect(toWaId('hello')).toBeNull();
    expect(toWaId('12345')).toBeNull();
    expect(toWaId('9'.repeat(20))).toBeNull();
  });

  it('honours a different default country', () => {
    expect(toWaId('4155550123', '1')).toBe('14155550123');
  });
});

describe('sameNumber', () => {
  it('matches across spellings', () => {
    expect(sameNumber('+91 98765 43210', '919876543210')).toBe(true);
    expect(sameNumber('09876543210', '9876543210')).toBe(true);
  });

  it('does not match different numbers', () => {
    expect(sameNumber('919876543210', '919876543211')).toBe(false);
  });

  it('is false when either side is unusable, never accidentally true', () => {
    // Two nulls normalising to null must not count as a match — that would
    // link an account to a sender with no number at all.
    expect(sameNumber(null, null)).toBe(false);
    expect(sameNumber('', '')).toBe(false);
    expect(sameNumber('hello', 'hello')).toBe(false);
  });
});

describe('formatWaId', () => {
  it('shows an Indian number the way an Indian reads it', () => {
    expect(formatWaId('919876543210')).toBe('+91 98765 43210');
  });

  it('falls back to plain international form', () => {
    expect(formatWaId('14155550123')).toBe('+14155550123');
  });
});
