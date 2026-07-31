// Token pool: sign in a bounded set of pre-provisioned test users once (in
// setup()) and hand VUs a JWT round-robin. Simulating 10k users does NOT
// require 10k tokens — a few hundred real sessions replayed is a faithful and
// far cheaper approximation of concurrent load.

import http from 'k6/http';
import { SharedArray } from 'k6/data';
import { BASE_URL, ANON_KEY, TOKEN_POOL } from '../config.js';

// Loaded at init time from the file the provision script writes. Absent file =>
// empty pool => scripts fall back to anon-key reads only (writes are skipped).
export const users = new SharedArray('loadtest-users', () => {
  try {
    return JSON.parse(open('../.users.json'));
  } catch (_e) {
    return [];
  }
});

// Password grant → { access_token, user_id }. Returns null on failure so the
// caller can decide (fall back to anon vs. fail).
export function signIn(email, password) {
  const res = http.post(
    `${BASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password }),
    { headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, tags: { op: 'auth' } },
  );
  if (res.status !== 200) return null;
  const body = res.json();
  return { token: body.access_token, userId: body.user && body.user.id };
}

// Build the shared token pool. Call from setup(); the returned array is passed
// to every VU by k6. Falls back to an anon-only entry when no users exist.
export function buildTokenPool() {
  if (users.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      'No .users.json found — running READ-ONLY with the anon key. ' +
        'Run scripts/provision-users.mjs to enable authenticated + write load.',
    );
    return [{ token: ANON_KEY, userId: null, anon: true }];
  }
  const n = Math.min(TOKEN_POOL, users.length);
  const pool = [];
  for (let i = 0; i < n; i++) {
    const u = users[i];
    const s = signIn(u.email, u.password);
    if (s && s.token) pool.push({ token: s.token, userId: s.userId, anon: false });
  }
  if (pool.length === 0) {
    throw new Error('Provisioned users exist but none could sign in — check credentials / project.');
  }
  // eslint-disable-next-line no-console
  console.log(`Token pool ready: ${pool.length} authenticated sessions.`);
  return pool;
}

// Pick a session for the current VU (stable per VU so writes attribute to one
// user, which is realistic).
export function sessionForVU(pool) {
  return pool[(__VU - 1) % pool.length];
}
