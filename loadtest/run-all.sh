#!/usr/bin/env bash
# Full local load-test suite against the Docker Supabase stack:
#   ensure stack up -> provision -> SMOKE -> CAPACITY RAMP -> REALTIME FAN-OUT -> teardown
#
# AI path (echo-ai) is OFF: it calls the real provider and costs tokens.
#
#   npm run loadtest:all
#   TARGET=2000 USERS=800 npm run loadtest:all      # bigger run
#   STOP_STACK=1 npm run loadtest:all               # also `supabase stop` at the end
#
# Knobs (env): TARGET (peak VUs, default 1000) · USERS (provisioned, default 500)
#   TOKEN_POOL (signed-in sessions, default 300) · STOP_STACK (1 = stop stack at end)
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

TARGET="${TARGET:-1000}"
USERS="${USERS:-500}"
TOKEN_POOL="${TOKEN_POOL:-300}"
STOP_STACK="${STOP_STACK:-0}"

fail() { echo "❌ $1"; exit 1; }
summary() { sed -n '/THRESHOLDS/,/checks_succeeded/p'; }   # compact k6 verdict

echo "════════ Echo load-test suite · local Docker ════════"

# ── ensure the local stack is up ───────────────────────────────────────────
if ! supabase status -o env >/tmp/lt_env 2>/dev/null || ! grep -q '^API_URL=' /tmp/lt_env; then
  echo "-- starting local stack (Docker) --"
  supabase start >/dev/null 2>&1 || fail "supabase start failed — is Docker running?"
  for i in $(seq 1 80); do
    supabase status -o env >/tmp/lt_env 2>/dev/null && grep -q '^API_URL=' /tmp/lt_env && break
    sleep 3
  done
fi
set -a; source /tmp/lt_env; set +a
[ -n "${API_URL:-}" ] || fail "could not resolve local API_URL"
export LOADTEST_URL="$API_URL" LOADTEST_ANON_KEY="$ANON_KEY" INCLUDE_AI=0
echo "target: $LOADTEST_URL   (AI path OFF)"

# ── clean slate + provision ────────────────────────────────────────────────
echo "-- clearing any prior [loadtest] artifacts --"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  node loadtest/scripts/teardown-users.mjs >/dev/null 2>&1 || true
echo "-- provisioning $USERS users --"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  COUNT="$USERS" node loadtest/scripts/provision-users.mjs 2>&1 | tail -2 || fail "provision failed"

ulimit -n 1048576 2>/dev/null || ulimit -n 200000 2>/dev/null || true

# ── [1/3] SMOKE (gates the rest) ───────────────────────────────────────────
echo ""
echo "════════ [1/3] SMOKE ════════"
k6 run loadtest/smoke.js 2>&1 | summary
[ "${PIPESTATUS[0]}" -eq 0 ] || fail "smoke failed — aborting before the ramp"

# ── [2/3] CAPACITY RAMP ────────────────────────────────────────────────────
echo ""
echo "════════ [2/3] CAPACITY RAMP · TARGET=$TARGET ════════"
TARGET="$TARGET" TOKEN_POOL="$TOKEN_POOL" k6 run loadtest/main.js 2>&1 | summary
ramp_rc="${PIPESTATUS[0]}"   # 99 = thresholds crossed; that's a data point, not a suite failure

# ── [3/3] REALTIME FAN-OUT (subscribers + concurrent writers) ──────────────
echo ""
echo "════════ [3/3] REALTIME FAN-OUT ════════"
# Local single-node Realtime refuses most WS upgrades above ~a few hundred
# concurrent (measured: 100 = clean, 500 = mostly refused). Keep the suite's
# subscriber count modest so this phase yields a meaningful fan-out signal
# locally; real fan-out scale numbers need a cloud project.
RT_TARGET=$(( TARGET < 200 ? TARGET : 200 ))
W_TARGET=$(( TARGET/4 > 50 ? TARGET/4 : 50 ))
TARGET="$RT_TARGET" HOLD=30s k6 run loadtest/realtime.js > /tmp/lt_rt.out 2>&1 &
rt_pid=$!
sleep 8   # let subscribers join before writers generate INSERT broadcasts
TARGET="$W_TARGET" RAMP=5s HOLD=18s RAMP_DOWN=3s k6 run loadtest/main.js > /tmp/lt_writer.out 2>&1
wait "$rt_pid"
grep -E "ws connected|realtime_broadcasts_received|realtime_connect_errors|checks_succeeded" /tmp/lt_rt.out | head

# ── teardown ───────────────────────────────────────────────────────────────
echo ""
echo "════════ TEARDOWN ════════"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  node loadtest/scripts/teardown-users.mjs 2>&1 | tail -3

if [ "$STOP_STACK" = "1" ]; then echo "-- stopping stack --"; supabase stop >/dev/null 2>&1; fi

echo ""
echo "════════ SUITE DONE (capacity ramp rc=$ramp_rc) ════════"
echo "Reminder: local Docker = laptop + single-node gateway, NOT prod capacity."
