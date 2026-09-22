import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORT_REASONS, URGENT_REPORT_REASONS } from './reportReasons';

function latestUrgentListInSql(): string[] {
  const dir = join(__dirname, '..', 'supabase', 'migrations');
  let body: string | null = null;
  for (const f of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
    const m = readFileSync(join(dir, f), 'utf8')
      .match(/function public\.report_reason_is_urgent\(p_reason text\)[\s\S]*?\$\$([\s\S]*?)\$\$/);
    if (m) body = m[1];
  }
  expect(body, 'report_reason_is_urgent must exist in a migration').not.toBeNull();
  return [...body!.matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('report reasons', () => {
  it('urgent reasons match what the database treats as urgent', () => {
    expect([...latestUrgentListInSql()].sort()).toEqual([...URGENT_REPORT_REASONS].sort());
  });

  it('offers every urgent reason on the report screen, including child safety', () => {
    for (const r of URGENT_REPORT_REASONS) expect(REPORT_REASONS).toContain(r);
    expect(REPORT_REASONS).toContain('Child sexual abuse or exploitation');
  });
});
