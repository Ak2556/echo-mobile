import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The behaviour itself was checked against a local Postgres; this pins the shape
// so a later edit cannot quietly reopen it.
const sql = readFileSync(resolve(__dirname, '../supabase/migrations/20261004090000_cron_health_redact.sql'), 'utf8');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

describe('cron_health redaction migration', () => {
  it('moves the real function to one only the service role can run', () => {
    expect(code).toMatch(/rename to cron_health_full/);
    expect(code).toMatch(/revoke all on function public\.cron_health_full\(\) from public, anon, authenticated/);
    expect(code).toMatch(/grant execute on function public\.cron_health_full\(\) to service_role/);
    expect(code).not.toMatch(/grant execute on function public\.cron_health_full\(\)[^;]*(anon|authenticated)/);
  });

  it('keeps the old name and columns, so the healthcheck and heartbeat keep working', () => {
    expect(code).toMatch(/create or replace function public\.cron_health\(\)\s+returns table\(unhealthy integer, detail text\)/);
    expect(code).toMatch(/grant execute on function public\.cron_health\(\) to anon, authenticated, service_role/);
  });

  it('blanks the detail for end-user roles only, so a SQL session still sees it', () => {
    expect(code).toMatch(/in \('anon', 'authenticated'\)\s+then null/);
  });
});
