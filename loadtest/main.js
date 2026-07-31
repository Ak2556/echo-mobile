// Combined capacity test — a realistic weighted user session ramped to TARGET
// concurrent VUs. This is the script that answers "what's our ceiling?".
//
//   k6 run -e LOADTEST_URL=... -e LOADTEST_ANON_KEY=... -e TARGET=2000 loadtest/main.js
//
// Traffic mix is read-dominant (like a real social feed). Writes are on by
// default (INCLUDE_WRITES=0 to disable); echo-ai is off by default (INCLUDE_AI=1
// to include it — it costs tokens and is rate limited).

import { sleep } from 'k6';
import { rampingStages, INCLUDE_AI, INCLUDE_WRITES, assertSafeTarget } from './config.js';
import { buildTokenPool, sessionForVU } from './lib/auth.js';
import { feedReadChrono, feedReadRanked, createEcho, likeEcho, echoAI } from './lib/actions.js';

export const options = {
  scenarios: {
    user_session: { executor: 'ramping-vus', startVUs: 0, stages: rampingStages() },
  },
  thresholds: {
    // Fail the run if these regress — this is the "top-notch experience" bar.
    // unexpected_errors excludes expected rate-limit rejections (AI 429s + the
    // app_rate_limits write caps), unlike http_req_failed which counts the
    // limiter doing its job as a failure.
    unexpected_errors: ['rate<0.01'], // <1% genuine errors
    echo_feed_latency: ['p(95)<800', 'p(99)<1500'], // feed reads snappy
    checks: ['rate>0.99'],
  },
};

export function setup() {
  assertSafeTarget();
  return { pool: buildTokenPool() };
}

export default function (data) {
  const { token, userId } = sessionForVU(data.pool);

  // A session: land on the feed, scroll, occasionally act.
  const ids = Math.random() < 0.5 ? feedReadRanked(token, userId) : feedReadChrono(token);
  sleep(rand(1, 3)); // read/scroll think-time

  if (INCLUDE_WRITES && userId) {
    const roll = Math.random();
    if (roll < 0.15 && ids.length) {
      likeEcho(token, userId, ids[Math.floor(Math.random() * ids.length)]);
      sleep(rand(0.5, 1.5));
    } else if (roll < 0.22) {
      createEcho(token, userId); // ~7% of sessions post
      sleep(rand(1, 2));
    }
  }

  if (INCLUDE_AI && userId && Math.random() < 0.05) {
    echoAI(token); // ~5% of sessions ask the AI
  }

  sleep(rand(1, 4)); // between-action idle
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}
