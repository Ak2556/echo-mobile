// Smoke test — 1 VU, one pass over every hot path. Run this FIRST to confirm
// the target, auth, and request shapes are correct before scaling up.
//
//   k6 run -e LOADTEST_URL=... -e LOADTEST_ANON_KEY=... loadtest/smoke.js

import { sleep } from 'k6';
import { INCLUDE_AI, assertSafeTarget } from './config.js';
import { buildTokenPool, sessionForVU } from './lib/auth.js';
import { feedReadChrono, feedReadRanked, createEcho, likeEcho, echoAI } from './lib/actions.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: { checks: ['rate>0.99'] },
};

export function setup() {
  assertSafeTarget();
  return { pool: buildTokenPool() };
}

export default function (data) {
  const { token, userId } = sessionForVU(data.pool);

  const chronoIds = feedReadChrono(token);
  sleep(0.5);
  const rankedIds = feedReadRanked(token, userId);
  sleep(0.5);

  if (userId) {
    const newId = createEcho(token, userId);
    sleep(0.5);
    const target = newId || rankedIds[0] || chronoIds[0];
    likeEcho(token, userId, target);
    sleep(0.5);
  }

  if (INCLUDE_AI) echoAI(token);
}
