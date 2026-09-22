import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADULT_AGE,
  MINIMUM_AGE,
  ageInYears,
  checkDateOfBirth,
} from '../constants/legal/ageGate';

// A fixed "today" so these never drift with the wall clock.
const TODAY = new Date('2026-08-22T00:00:00Z');
const dob = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('ageInYears', () => {
  it('counts whole years', () => {
    expect(ageInYears(dob('2000-08-22'), TODAY)).toBe(26);
  });

  it('does not round up before the birthday', () => {
    // One day short of turning 18.
    expect(ageInYears(dob('2008-08-23'), TODAY)).toBe(17);
  });

  it('counts the birthday itself', () => {
    expect(ageInYears(dob('2008-08-22'), TODAY)).toBe(18);
  });

  it('handles a birthday later in the year', () => {
    expect(ageInYears(dob('2008-12-31'), TODAY)).toBe(17);
  });
});

describe('checkDateOfBirth', () => {
  it('accepts an adult and marks them adult', () => {
    const r = checkDateOfBirth(dob('1995-01-01'), TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.isAdult).toBe(true);
      expect(r.age).toBe(31);
    }
  });

  it('rejects a 17 year old', () => {
    // DPDP treats under-18s as children needing parental consent, which Echo
    // does not collect, so they cannot hold an account.
    const r = checkDateOfBirth(dob('2009-01-01'), TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too-young');
  });

  it('accepts exactly the minimum age', () => {
    const r = checkDateOfBirth(dob('2008-08-22'), TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.age).toBe(MINIMUM_AGE);
  });

  it('rejects one day under the minimum age', () => {
    const r = checkDateOfBirth(dob('2008-08-23'), TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('too-young');
      expect(r.age).toBe(MINIMUM_AGE - 1);
    }
  });

  it('rejects a future date', () => {
    const r = checkDateOfBirth(dob('2030-01-01'), TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('future');
  });

  it('rejects an implausible date', () => {
    const r = checkDateOfBirth(dob('1850-01-01'), TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('implausible');
  });

  it('rejects an invalid date', () => {
    const r = checkDateOfBirth(new Date('not a date'), TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('implausible');
  });
});

describe('thresholds', () => {
  it('never admits anyone below the profiling threshold', () => {
    expect(MINIMUM_AGE).toBeLessThanOrEqual(ADULT_AGE);
  });

  it('matches the minimum enforced in Postgres', () => {
    // The client check is only a courtesy; the trigger is the gate. If they
    // disagree, users see one rule and get the other.
    const dir = join(__dirname, '..', 'supabase', 'migrations');
    const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    let sqlMinimum: number | null = null;
    for (const f of files) {
      const m = readFileSync(join(dir, f), 'utf8')
        .match(/function public\.minimum_age_years\(\)[\s\S]*?select (\d+)/);
      if (m) sqlMinimum = Number(m[1]);
    }
    expect(sqlMinimum).toBe(MINIMUM_AGE);
  });
});
