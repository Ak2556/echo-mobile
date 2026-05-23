# Monitoring runbook

This runbook covers how to check whether Echo's backend is healthy, where
the dashboards live, and what to do when something is on fire.

## At-a-glance dashboards

| Surface | URL | Owner |
| --- | --- | --- |
| Supabase status | <https://status.supabase.com> | Supabase |
| LiveKit status | <https://status.livekit.io> | LiveKit |
| OpenRouter status | <https://status.openrouter.ai> | OpenRouter |
| FastAPI backend (Railway/Render) | `${EXPO_PUBLIC_API_URL}/health` | Echo team |
| Public-facing status page | `${STATUSPAGE_URL}` (set up Better Uptime / Instatus before launch) | Echo team |

## Health endpoints

Each ping below should return HTTP 200 within ~1s. The GitHub Actions
`Echo Healthcheck` workflow (`.github/workflows/healthcheck.yml`) runs all
three every 15 minutes and opens an issue automatically on failure.

- Supabase REST: `GET ${EXPO_PUBLIC_SUPABASE_URL}/rest/v1/` (needs `apikey` header)
- FastAPI: `GET ${EXPO_PUBLIC_API_URL}/health`
- Edge Function `echo-ai` (optional smoke test): `OPTIONS ${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/echo-ai`

## Where the logs live

| Layer | Where |
| --- | --- |
| Edge Function `echo-ai` | Supabase Dashboard → Edge Functions → echo-ai → Logs |
| FastAPI request logs | Railway → echo-backend → Deploy Logs |
| Client crash reports | Sentry → Echo iOS project |
| Client analytics | PostHog → Echo project |

## Common incidents

### "AI is down"

1. Check Supabase status page first — Edge Functions ride on top.
2. Open Supabase → Edge Functions → echo-ai → Logs and filter to the last 15 min.
3. If you see `OpenRouter 5xx` errors, check the OpenRouter status page.
4. If logs are empty but the client errors, check the `echo-ai` function's
   secrets: `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`. Rotating any of these clears active sessions.

### "Users hitting AI rate limits unexpectedly"

The Edge Function caps free users at 30 requests/hour (see
`supabase/functions/echo-ai/rateLimit.ts`). To bump the limit, edit
`FREE_LIMIT`/`PRO_LIMIT` constants and redeploy. To clear a single user's
counter, run the SQL below in the Supabase SQL editor:

```sql
delete from public.ai_rate_limits where user_id = '<uuid>';
```

### "Feed empty / fresh post not appearing"

Posts only appear when `public_echoes.check_content = true`. The Edge
Function flips this on after the moderation API returns "safe". If the
moderation API is down, posts may be inserted but stay invisible; check
the Edge Function logs for `moderation http` warnings. The flag fails
open inside `moderation.ts`, but the feed query still filters on the
column, so verify both before declaring an incident.

### "Push notifications stopped"

1. Check `supabase/functions/push-fanout/index.ts` logs in Supabase.
2. Confirm the APNs key in Expo dashboard hasn't expired.
3. Run a manual push test from the Expo dashboard against the affected
   user's `push_token`.

## Escalation

- **P1 — public feed unreadable / signups broken**: ping the on-call,
  open a status page incident, file a follow-up issue with logs attached.
- **P2 — degraded AI / push delays**: file a GitHub issue with the
  runbook section you used; resolve within 24h.
- **P3 — single-tenant flake**: comment in the auto-created healthcheck
  issue (the workflow dedupes), close once healthy.
