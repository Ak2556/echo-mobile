/**
 * Echo is India-first, and the original normaliser assumed +1. A user typing
 * their number the way they would say it out loud got a US number, and the OTP
 * went somewhere else entirely. These tests pin the forms Indian users actually
 * type, and keep explicit country codes working for the other 13 languages.
 */
import { describe, expect, it } from 'vitest';
import { isValidE164, normalizeE164 } from './phoneNumber';

describe('Indian numbers, as people type them', () => {
  it('treats a bare 10-digit number as Indian', () => {
    // The regression: this used to produce +19876543210.
    expect(normalizeE164('9876543210')).toBe('+919876543210');
  });

  it('accepts the spacing people use', () => {
    expect(normalizeE164('98765 43210')).toBe('+919876543210');
    expect(normalizeE164('98765-43210')).toBe('+919876543210');
    expect(normalizeE164('(98765) 43210')).toBe('+919876543210');
  });

  it('drops the trunk zero used when dialling domestically', () => {
    // This used to produce +09876543210, which is not valid E.164 at all.
    expect(normalizeE164('09876543210')).toBe('+919876543210');
  });

  it('accepts the country code without a plus', () => {
    expect(normalizeE164('919876543210')).toBe('+919876543210');
  });

  it('accepts the 00 international prefix', () => {
    expect(normalizeE164('00919876543210')).toBe('+919876543210');
  });

  it('leaves an already-correct number alone', () => {
    expect(normalizeE164('+919876543210')).toBe('+919876543210');
  });
});

describe('an explicit country code always wins', () => {
  it('keeps a US number', () => {
    expect(normalizeE164('+1 415 555 2671')).toBe('+14155552671');
  });

  it('keeps a UK number', () => {
    expect(normalizeE164('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('honours an explicit default for other regions', () => {
    expect(normalizeE164('4155552671', '1')).toBe('+14155552671');
  });
});

describe('empty and junk input', () => {
  it('returns empty rather than a bare plus', () => {
    for (const input of ['', '   ', '+', '00', '-()']) {
      expect(normalizeE164(input)).toBe('');
    }
  });
});

describe('validation gates a paid SMS', () => {
  it('accepts a real Indian mobile', () => {
    for (const n of ['+916000000000', '+917000000000', '+919876543210']) {
      expect(isValidE164(n)).toBe(true);
    }
  });

  it('rejects an Indian number that is not a mobile', () => {
    // Landlines cannot receive SMS; sending would spend money for nothing.
    expect(isValidE164('+915876543210')).toBe(false);
  });

  it('rejects the wrong number of digits for India', () => {
    expect(isValidE164('+91987654321')).toBe(false);
    expect(isValidE164('+9198765432101')).toBe(false);
  });

  it('rejects malformed E.164', () => {
    for (const n of ['', '+', '9876543210', '+09876543210', '+91abc']) {
      expect(isValidE164(n)).toBe(false);
    }
  });

  it('does not impose Indian rules on other countries', () => {
    expect(isValidE164('+14155552671')).toBe(true);
  });

  it('rejects more than 15 digits, the E.164 maximum', () => {
    expect(isValidE164('+1234567890123456')).toBe(false);
  });
});
