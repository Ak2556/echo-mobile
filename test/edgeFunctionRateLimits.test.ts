import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Per-user limits only protect an endpoint that calls one. A new function that
 * a signed-in user can reach, and that spends money or a shared quota, is
 * unlimited until someone remembers; spotify-search, livekit-token and
 * razorpay-create-order were exactly that. This makes the omission a failing
 * test, so adding an endpoint forces a choice: spend a budget, or say here why
 * not.
 */
const root = resolve(__dirname, '..');
const fnDir = resolve(root, 'supabase/functions');

const LIMITED = /spendActionBudget|checkAndIncrementRateLimit|check_app_rate_limit/;

/** Functions a signed-in user cannot call to spend anything, with the reason. */
const EXEMPT: Record<string, string> = {
  'backfill-embeddings': 'service-side, guarded by x-admin-secret',
  'daily-question-push': 'pg_cron only, guarded by a shared secret',
  'delete-account': 'one-shot erasure of the caller own account',
  'embed-interests': 'cron only, guarded by x-ops-probe-secret',
  'learn-guest-booking': 'public; capped per tutor inside the handler (MAX_PENDING_PER_HOUR)',
  'og-redirect': 'public read-only link-preview crawler endpoint, no spend',
  'ops-probe': 'cron only, guarded by x-ops-probe-secret',
  'personalized-fanout': 'pg_cron only, guarded by a shared secret',
  'push-fanout': 'database trigger and manual sends, guarded by x-push-fanout-secret',
  'razorpay-webhook': 'Razorpay, HMAC signature over the body',
  'revenuecat-webhook': 'RevenueCat, HMAC signature over the body',
  worker: 'pg_net kick from the database, guarded by x-worker-secret',
};

const functions = readdirSync(fnDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('_') && existsSync(resolve(fnDir, d.name, 'index.ts')))
  .map(d => d.name)
  .sort();

describe('edge function rate limits', () => {
  it.each(functions.filter(f => !(f in EXEMPT)))('%s spends a per-user budget', (fn) => {
    const source = readFileSync(resolve(fnDir, fn, 'index.ts'), 'utf8');
    expect(
      LIMITED.test(source),
      `${fn} is callable by a signed-in user but never spends a budget. Call spendActionBudget ` +
        `(supabase/functions/_shared/actionLimit.ts) after authenticating, or add it to EXEMPT with the reason.`,
    ).toBe(true);
  });

  it('keeps the exemption list honest', () => {
    for (const fn of Object.keys(EXEMPT)) {
      expect(functions, `${fn} is exempt but no longer exists; remove it from EXEMPT`).toContain(fn);
    }
  });

  it('does not exempt a function that already limits itself', () => {
    for (const fn of Object.keys(EXEMPT)) {
      if (!functions.includes(fn)) continue;
      const source = readFileSync(resolve(fnDir, fn, 'index.ts'), 'utf8');
      expect(LIMITED.test(source), `${fn} spends a budget; drop it from EXEMPT`).toBe(false);
    }
  });
});
