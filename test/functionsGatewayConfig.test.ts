import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Functions deploy from supabase/config.toml (.github/workflows/functions.yml),
 * so a missing verify_jwt block is no longer a forgotten CLI flag on one
 * manual deploy: it is a 401 on every call after the next merge. These are
 * the endpoints whose callers cannot present a Supabase JWT.
 */
const root = resolve(__dirname, '..');
const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');

const NO_USER_JWT: Record<string, string> = {
  'learn-guest-booking': 'guests without a session',
  'daily-question-push': 'pg_cron via pg_net',
  'personalized-fanout': 'pg_cron via pg_net',
  'voice-command': 'recorded in source as live',
  worker: 'pg_net kick from the database',
  'revenuecat-webhook': 'RevenueCat',
  'razorpay-webhook': 'Razorpay',
  'og-redirect': 'link-preview crawlers',
};

describe('edge function gateway settings live in config', () => {
  it.each(Object.entries(NO_USER_JWT))('%s (%s) is reachable without a user JWT', (fn) => {
    expect(existsSync(resolve(root, 'supabase/functions', fn, 'index.ts'))).toBe(true);
    expect(config).toMatch(new RegExp(`\\[functions\\.${fn}\\]\\s*\\nverify_jwt = false`));
  });

  it('deploys only after migrations are applied', () => {
    const wf = readFileSync(resolve(root, '.github/workflows/functions.yml'), 'utf8');
    expect(wf.indexOf('supabase db push')).toBeGreaterThan(-1);
    expect(wf.indexOf('supabase db push')).toBeLessThan(wf.indexOf('supabase functions deploy'));
  });
});
