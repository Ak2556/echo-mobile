import { describe, expect, it } from 'vitest';
import { interestRows, needsDateOfBirth } from './interestsSync';

describe('interestRows', () => {
  it('builds one row per interest', () => {
    expect(interestRows('u1', ['philosophy', 'music'])).toEqual([
      { user_id: 'u1', interest: 'philosophy' },
      { user_id: 'u1', interest: 'music' },
    ]);
  });

  it('normalises case and whitespace so the same choice is one row', () => {
    expect(interestRows('u1', [' Philosophy ', 'PHILOSOPHY'])).toEqual([
      { user_id: 'u1', interest: 'philosophy' },
    ]);
  });

  it('drops entries the column would reject rather than losing the whole list', () => {
    const rows = interestRows('u1', ['', '   ', 'x'.repeat(65), 'books']);
    expect(rows).toEqual([{ user_id: 'u1', interest: 'books' }]);
  });

  it('returns nothing without a user', () => {
    expect(interestRows('', ['books'])).toEqual([]);
    expect(interestRows('u1', [])).toEqual([]);
  });
});

describe('needsDateOfBirth', () => {
  it('asks only when no age is on file', () => {
    expect(needsDateOfBirth(null)).toBe(true);
    expect(needsDateOfBirth(undefined)).toBe(true);
    expect(needsDateOfBirth(25)).toBe(false);
    // A recorded age below the minimum is a server-side problem, not a reason
    // to ask again — the account is already barred by the age trigger.
    expect(needsDateOfBirth(15)).toBe(false);
  });
});
