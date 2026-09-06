# Monitoring and incident response

Written for one person. Every procedure here assumes you are alone, possibly
tired, and that the thing you are looking at may not be the thing that is wrong.

---

## The lesson this file was born from

From 2026-08-15 to 2026-09-06, the healthcheck failed every fifteen minutes and
appended a comment to a single incident issue. It reached **439 comments**. It
was pinging a FastAPI service that had been deleted. Every workflow run reported
`success`, because the alert job's failure did not fail the workflow.

Nothing was broken. But for twenty-two days the only production alarm produced a
continuous false positive, which means a real outage in that window would have
been indistinguishable from the noise.

**The rule that follows from it:** a check that cannot fail is decoration, and a
check that always fails is worse than no check. If an alert fires and you decide
not to act, that is not "triage" — either fix the check or delete it, in the
same sitting. An alarm you have learned to ignore is a liability, not a safety
net.

---

## What is monitored

`.github/workflows/healthcheck.yml`, every 15 minutes:

| Check | Healthy | What its failure means |
|---|---|---|
| Supabase REST | 200/401/404 | The database is unreachable. Everything is down. |
| Cloudflare media worker | any < 500 | Images and video will not load. The app looks broken but works. |
| Supabase edge functions | any < 500 | Voice, chat and translation are down. AI features fail. |
| `downloadecho.com/privacy` | 200 | Store listings are out of compliance. Not user-visible; blocks resubmission. |

The worker probe requests a key that will never exist in a real bucket, so it
exercises R2 binding rather than just routing. A probe against an unrouted path
would 404 even on a completely broken worker — which is why the obvious version
of this check is worthless.

## What is NOT monitored, and what to do about it

- **Crons.** `personalized-fanout` was silently dead for weeks (missing Vault
  secret, missing FK) while reporting healthy. Nothing watches them now.
- **Quota.** The AI account is free tier. Voice, chat and translation fail with
  errors that look like bugs when they are budget.
- **Push delivery.** Only a fraction of users have tokens.

Until these are covered, `npm run audit:backend` is the manual substitute. Run
it before every release. It calls each RPC for real rather than trusting that a
green deploy means a working one.

---

## When an alert fires

**1. Confirm it is real before doing anything.** The alert may be the wrong
shape, as it was for twenty-two days.

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$SUPABASE_URL/rest/v1/"
curl -s -o /dev/null -w '%{http_code}\n' "$WORKER_URL/media/echo-media/__healthcheck__"
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS "$SUPABASE_URL/functions/v1/voice-command"
curl -s -o /dev/null -w '%{http_code}\n' -L https://downloadecho.com/privacy
```

**2. Check whether it is quota rather than breakage.** AI failures are usually
budget, not bugs. Look at the provider dashboard before reading any code.

**3. Check whether it is you.** The most recent deploy is the most likely cause.
`git log --oneline -5` and the Actions tab, in that order.

---

## Rollback, fastest first

| Broken thing | How to undo it | How long |
|---|---|---|
| JS-only regression | Re-run **OTA Updates** from the previous good commit | minutes |
| Edge function | `supabase functions deploy <name>` from the previous commit | minutes |
| Cloudflare worker | `wrangler rollback` or redeploy the previous version | minutes |
| Web / downloadecho.com | Netlify → Deploys → publish the previous deploy | one click |
| Native regression | **You cannot roll back a released binary.** Halt the staged rollout in Play Console, then ship a fix. | hours to days |

The asymmetry in that last row is the whole argument for keeping risky things
behind flags rather than in native code.

**Note the gap: there is no remote kill switch.** `lib/featureFlags.ts` is a
compile-time constant map. Disabling a feature today requires an OTA at best and
a store release at worst. Until that changes, the fastest way to stop a
misbehaving feature is usually to break its backend — revoke the function
secret, or drop the RPC's grant — which is ugly and should be recorded here as a
deliberate act, not discovered later as sabotage.

---

## Database changes

`supabase/migrations/` is meant to be the only source of truth for the schema.
**As of 2026-09-06 it is not:** five local migrations have no remote counterpart
and five remote entries have no local file, all from 2026-09-02 and 09-04. That
is the signature of SQL applied through the dashboard or MCP instead of
`db push`, which lands the change under a fresh timestamp.

Consequences: `supabase db push` would try to re-apply five migrations, and the
schema cannot be rebuilt from the repository. Repair with
`supabase migration repair --status applied <version>` before the next
migration, not after.

**Always use the CLI, never the claude.ai Supabase connector** — it resolves to
the wrong project.

---

## If you are unavailable

The obligations that do not pause because you are asleep, ill, or travelling:

- **Illegal content notices** to `dsa@downloadecho.com` (DSA Art. 16) must be
  handled in a timely way. Automated acknowledgement is not a decision.
- **Account deletion requests** — the `delete-account` function handles these
  without you, which is why it must keep working.
- **Payment disputes** through Razorpay and the stores have response windows.

Before any absence longer than a couple of days: run `npm run audit:backend`,
confirm no incident issue is open, and check the AI provider's balance. Those
three cover most of what fails quietly.
