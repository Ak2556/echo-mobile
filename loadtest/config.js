// Central config + safety guard for the Echo load-test harness (k6).
//
// Everything is env-driven so the same scripts run against a throwaway staging
// project (recommended) or, deliberately, prod. Nothing here has a default that
// points at a real backend — you MUST pass LOADTEST_URL / LOADTEST_ANON_KEY.

// The known PRODUCTION Supabase project ref. Load-testing this is refused
// unless you explicitly acknowledge the blast radius (see assertSafeTarget).
const PROD_REF = 'eyokhisijabitzjiydmz';

export const BASE_URL = (__ENV.LOADTEST_URL || '').replace(/\/+$/, '');
export const ANON_KEY = __ENV.LOADTEST_ANON_KEY || '';

// Scale knobs (safe defaults — you opt IN to real load).
export const TARGET = Number(__ENV.TARGET || 50); // peak virtual users
export const RAMP = __ENV.RAMP || '30s'; // ramp-up duration to TARGET
export const HOLD = __ENV.HOLD || '1m'; // steady-state at TARGET
export const RAMP_DOWN = __ENV.RAMP_DOWN || '15s';

// echo-ai costs real AI tokens and is per-user rate limited (30/hr free).
// Off by default so a capacity run doesn't burn money or drown in 429s.
export const INCLUDE_AI = __ENV.INCLUDE_AI === '1';

// Writes create real rows. All test rows are tagged so teardown can find them.
export const INCLUDE_WRITES = __ENV.INCLUDE_WRITES !== '0'; // on by default
export const LOADTEST_TAG = '[loadtest]';

// How many distinct users to sign in for the token pool. VUs share these
// round-robin — no need to mint 10k tokens to simulate 10k users.
export const TOKEN_POOL = Number(__ENV.TOKEN_POOL || 200);

// Column list mirrored from lib/supabaseEchoApi.ts (ECHO_SELECT) so the feed
// read exercises the same payload size the app actually requests.
export const ECHO_SELECT =
  'id,author_id,title,prompt,response,likes_count,comment_count,repost_count,view_count,created_at,media_urls,quoted_echo_id,parent_echo_id,remix_root_id,remix_count,perspective_type,perspective_note,source_url,source_conversation_id,thoughtfulness_score,mind_blown_count,taking_notes_count,agree_count,disagree_count,co_author_id,co_author_response,post_type';

export function assertSafeTarget() {
  if (!BASE_URL || !ANON_KEY) {
    throw new Error(
      'Set LOADTEST_URL and LOADTEST_ANON_KEY. Point them at a STAGING Supabase project, not prod.',
    );
  }
  if (BASE_URL.includes(PROD_REF) && __ENV.LOADTEST_ALLOW_PROD !== 'yes-i-own-the-blast-radius') {
    throw new Error(
      `Refusing to load-test the known production project (${PROD_REF}). ` +
        'Create a staging project and point LOADTEST_URL at it. ' +
        'To override (NOT recommended): LOADTEST_ALLOW_PROD=yes-i-own-the-blast-radius',
    );
  }
}

// Standard stage profile shared by the scenario scripts.
export function rampingStages() {
  return [
    { duration: RAMP, target: TARGET },
    { duration: HOLD, target: TARGET },
    { duration: RAMP_DOWN, target: 0 },
  ];
}
