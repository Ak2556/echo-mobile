-- Turn on sealed 1:1 DMs in production, matching the compiled default.
--
-- 20260926160000 seeded the e2eeSend kill switch as false. The client default
-- became true afterwards (1:1 E2EE is a launch requirement), and a remote
-- false overrides it, so a fresh install sealed only until its first flag
-- fetch and then silently stopped. This is step 2 of docs/runbook/e2ee-rollout.md,
-- done as a migration so the repository and production agree.
--
-- Safe before the build ships: no installed build reads this flag, and as of
-- 2026-09-29 there are no registered devices and no sealed messages. The row
-- stays the kill switch; setting it back to false stops sealing without
-- hiding any message, because reading is never gated.
update public.feature_flags
   set enabled = true,
       updated_at = now()
 where key = 'e2eeSend';
