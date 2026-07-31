// The hot-path actions, each mirroring a real client call. Every function
// records a k6 check and returns useful data (e.g. echo ids) for chaining.
//
// Request shapes verified against the app source:
//   feed (chrono)  -> lib/supabaseEchoApi.ts fetchRemoteFeed
//   feed (ranked)  -> lib/supabaseEchoApi.ts fetchRankedFeed / get_ranked_feed RPC
//   create echo    -> lib/supabaseEchoApi.ts (insert public_echoes)
//   like           -> lib/supabaseEchoApi.ts (insert echo_likes)
//   echo-ai        -> lib/api.ts streamEchoAI (POST functions/v1/echo-ai)

import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { BASE_URL, ECHO_SELECT, LOADTEST_TAG } from '../config.js';
import { restHeaders, restWriteHeaders, functionHeaders } from './http.js';

export const feedLatency = new Trend('echo_feed_latency', true);
export const aiLatency = new Trend('echo_ai_latency', true);
export const rateLimited = new Counter('echo_rate_limited'); // AI 429s (expected under AI load)
export const writeRateLimited = new Counter('echo_write_rate_limited'); // app-wide write caps (expected)

// True error rate — EXCLUDES expected rate-limit rejections (429s and the
// app_rate_limits triggers that return 400 rate_limit_exceeded). This is the
// number the "top-notch experience" thresholds should watch, not http_req_failed
// (which counts the rate limiter doing its job as a "failure").
export const unexpectedErrors = new Rate('unexpected_errors');

// The app-wide write rate limiters (migration 20260622091000) reject over-limit
// inserts with HTTP 400 + body "rate_limit_exceeded:...". That's correct
// behavior, not an outage.
function isWriteRateLimited(res) {
  return res.status === 400 && typeof res.body === 'string' && res.body.includes('rate_limit_exceeded');
}

// Chronological feed — the moderation-gated fallback read, highest volume.
export function feedReadChrono(token) {
  const url =
    `${BASE_URL}/rest/v1/public_echoes` +
    `?select=${encodeURIComponent(ECHO_SELECT)}` +
    `&check_content=eq.true&order=created_at.desc&limit=50`;
  const res = http.get(url, { headers: restHeaders(token), tags: { op: 'feed_chrono' } });
  feedLatency.add(res.timings.duration);
  check(res, { 'feed chrono 200': (r) => r.status === 200 });
  unexpectedErrors.add(res.status !== 200);
  if (res.status !== 200) return [];
  const rows = res.json();
  return Array.isArray(rows) ? rows.map((r) => r.id) : [];
}

// Ranked feed — the real default feed (server-scored RPC).
export function feedReadRanked(token, userId) {
  const res = http.post(
    `${BASE_URL}/rest/v1/rpc/get_ranked_feed`,
    JSON.stringify({
      p_user_id: userId || null,
      p_limit: 50,
      p_gravity: 1.8,
      p_cursor_score: null,
      p_cursor_id: null,
      p_following_only: false,
    }),
    { headers: restHeaders(token), tags: { op: 'feed_ranked' } },
  );
  feedLatency.add(res.timings.duration);
  check(res, { 'feed ranked 200': (r) => r.status === 200 });
  unexpectedErrors.add(res.status !== 200);
  if (res.status !== 200) return [];
  const rows = res.json();
  return Array.isArray(rows) ? rows.map((r) => r.id) : [];
}

// Create a post. Tagged with LOADTEST_TAG in the title so teardown finds it.
export function createEcho(token, userId) {
  if (!userId) return null; // anon can't write
  const body = {
    author_id: userId,
    title: `${LOADTEST_TAG} ${Date.now()}-${__VU}`,
    prompt: `${LOADTEST_TAG} synthetic prompt from VU ${__VU}`,
    response: `${LOADTEST_TAG} synthetic response — load test only.`,
  };
  const res = http.post(`${BASE_URL}/rest/v1/public_echoes`, JSON.stringify(body), {
    headers: restWriteHeaders(token),
    tags: { op: 'create_echo' },
  });
  if (isWriteRateLimited(res)) {
    writeRateLimited.add(1); // expected: publish cap (12/hr per user) — not an error
    unexpectedErrors.add(false);
    return null;
  }
  check(res, { 'create echo 201': (r) => r.status === 201 });
  unexpectedErrors.add(res.status !== 201);
  if (res.status !== 201) return null;
  const rows = res.json();
  return Array.isArray(rows) && rows[0] ? rows[0].id : null;
}

// Like an echo. Repeat likes hit the unique constraint (409); over-rate likes
// hit the 60/min cap (400 rate_limit_exceeded). Both are expected.
export function likeEcho(token, userId, echoId) {
  if (!userId || !echoId) return;
  const res = http.post(
    `${BASE_URL}/rest/v1/echo_likes`,
    JSON.stringify({ echo_id: echoId, user_id: userId }),
    { headers: restWriteHeaders(token), tags: { op: 'like' } },
  );
  if (isWriteRateLimited(res)) {
    writeRateLimited.add(1);
    unexpectedErrors.add(false);
    return;
  }
  const ok = res.status === 201 || res.status === 409;
  check(res, { 'like ok (201/409)': () => ok });
  unexpectedErrors.add(!ok);
}

// echo-ai stream. k6 reads the full SSE body (no streaming), which still
// measures end-to-end AI latency and whether the function survives concurrency.
// Costs real tokens + is rate limited — gate behind INCLUDE_AI.
export function echoAI(token) {
  const res = http.post(
    `${BASE_URL}/functions/v1/echo-ai`,
    JSON.stringify({ message: 'In one sentence, why is the sky blue?', current_screen: '/(tabs)/home' }),
    { headers: functionHeaders(token), tags: { op: 'echo_ai' }, timeout: '60s' },
  );
  aiLatency.add(res.timings.duration);
  if (res.status === 429) {
    rateLimited.add(1); // expected: per-user hourly AI cap
    unexpectedErrors.add(false);
    return;
  }
  check(res, { 'echo-ai 200': (r) => r.status === 200 });
  unexpectedErrors.add(res.status !== 200);
}
