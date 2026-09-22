import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES_REMINDER_SECTIONS } from '../constants/legal/rulesReminder';
import { isPublicRoute } from './publicRoutes';
import { destinationFor } from './notifications/presentation';
import { bypassesDailyCap } from './notifications/routing';

const sql = readFileSync(
  join(__dirname, '..', 'supabase', 'migrations', '20260922140000_quarterly_rules_reminder.sql'),
  'utf8',
);

describe('quarterly rules reminder (IT Rules 3(1)(c))', () => {
  it('reminds at least every three months', () => {
    expect(sql).toMatch(/interval '90 days'/);
    expect(sql).toMatch(/cron\.schedule\('rules-reminder', '30 5 \* \* \*'/);
  });

  it('ships the job inactive until a build that can open the notice is live', () => {
    expect(sql).toMatch(/cron\.alter_job\([\s\S]*'rules-reminder'[\s\S]*active := false\)/);
  });

  it('covers the rules, the data, and the consequences of breaking them', () => {
    const headings = RULES_REMINDER_SECTIONS.map(s => s.heading.toLowerCase());
    expect(headings.some(h => h.includes('do not'))).toBe(true);
    expect(headings.some(h => h.includes('data'))).toBe(true);
    expect(headings.some(h => h.includes('rules are broken'))).toBe(true);
    for (const s of RULES_REMINDER_SECTIONS) expect(s.points.length).toBeGreaterThan(0);
  });

  it('opens a page anyone can reach, and is never dropped by the daily cap', () => {
    expect(isPublicRoute('/legal/rules')).toBe(true);
    expect(destinationFor('rules_reminder')).toBe('rules');
    expect(bypassesDailyCap('rules_reminder')).toBe(true);
  });
});
