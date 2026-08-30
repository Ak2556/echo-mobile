-- SECURITY: trending_echoes_mv was granted ALL privileges to anon+authenticated.
--
-- The linter reported it as "selectable by anon", but the actual ACL was
-- `anon=arwdDxtm` — every privilege, not just SELECT. Two real consequences:
--
--   * SELECT leaked id / author_id / created_at / global_score for EVERY echo
--     in the last 30 days, including ones that never passed moderation: the MV
--     is built straight from public_echoes with no check_content filter, and a
--     materialized view is not subject to the base table's RLS. Content itself
--     was not exposed (the MV carries no title/prompt/response), but the
--     existence and authorship of hidden posts was.
--   * MAINTAIN (`m`, PG17+) permits REFRESH MATERIALIZED VIEW, so any anonymous
--     caller could trigger the refresh repeatedly — a cheap way to burn CPU on
--     a capped plan.
--
-- Nothing needs those grants. The MV is an internal ranking cache read only by
-- get_ranked_feed, which is SECURITY DEFINER and therefore executes as the
-- owner; no client or edge function selects from it directly. The hourly
-- refresh_trending_echoes cron runs as the postgres owner too.
--
-- Revoking is preferred over adding `where check_content = true` to the view:
-- it removes the exposure entirely rather than narrowing it, and avoids
-- recreating the MV (which would mean dropping and rebuilding
-- trending_echoes_mv_id_idx, the unique index REFRESH ... CONCURRENTLY needs).

revoke all on public.trending_echoes_mv from anon;
revoke all on public.trending_echoes_mv from authenticated;
