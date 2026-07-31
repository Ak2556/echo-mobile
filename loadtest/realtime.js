// Realtime fan-out load test — the scale concern flagged as #2.
//
// Mirrors lib/realtime.ts `useRealtimeNewEchoes`: every online client opens a
// WebSocket and subscribes to *unfiltered* INSERTs on public_echoes. This holds
// N concurrent subscriptions open so you can watch broadcast fan-out cost and
// realtime connection limits as N climbs. Run this ALONGSIDE main.js (whose
// writes generate the INSERT broadcasts) for a true fan-out picture.
//
//   k6 run -e LOADTEST_URL=... -e LOADTEST_ANON_KEY=... -e TARGET=500 loadtest/realtime.js

import ws from 'k6/ws';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, ANON_KEY, TARGET, HOLD, assertSafeTarget } from './config.js';
import { buildTokenPool, sessionForVU } from './lib/auth.js';

const broadcasts = new Counter('realtime_broadcasts_received');
const connectErrors = new Counter('realtime_connect_errors');

const holdMs = parseDurationMs(HOLD);

export const options = {
  scenarios: {
    subscribers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: TARGET },
        { duration: HOLD, target: TARGET },
        { duration: '15s', target: 0 },
      ],
    },
  },
};

export function setup() {
  assertSafeTarget();
  return { pool: buildTokenPool() };
}

export default function (data) {
  const session = sessionForVU(data.pool);
  const wsUrl = `${BASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${ANON_KEY}&vsn=1.0.0`;

  const res = ws.connect(wsUrl, {}, function (socket) {
    socket.on('open', () => {
      // Join the postgres_changes topic for public_echoes INSERTs (unfiltered,
      // exactly like the app).
      socket.send(
        JSON.stringify({
          topic: 'realtime:public:public_echoes',
          event: 'phx_join',
          payload: {
            config: {
              postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'public_echoes' }],
            },
            access_token: session.token,
          },
          ref: '1',
        }),
      );
      // Refresh RLS token (no-op for anon) — required by newer Realtime.
      socket.send(
        JSON.stringify({
          topic: 'realtime:public:public_echoes',
          event: 'access_token',
          payload: { access_token: session.token },
          ref: '2',
        }),
      );
      // Phoenix heartbeat so the connection isn't reaped.
      socket.setInterval(() => {
        socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }));
      }, 25000);
    });

    socket.on('message', (msg) => {
      // Count actual data broadcasts (the fan-out we care about), not joins/acks.
      if (msg.includes('postgres_changes') && msg.includes('INSERT')) broadcasts.add(1);
    });

    socket.on('error', () => connectErrors.add(1));

    socket.setTimeout(() => socket.close(), holdMs);
  });

  check(res, { 'realtime ws connected (101)': (r) => r && r.status === 101 });
}

function parseDurationMs(d) {
  const m = /^(\d+)(s|m)$/.exec(d);
  if (!m) return 60000;
  return Number(m[1]) * (m[2] === 'm' ? 60000 : 1000);
}
