-- Follow-up to 20261016120000. Postgres 17 added a table privilege, MAINTAIN (VACUUM, ANALYZE,
-- REINDEX, CLUSTER, REFRESH MATERIALIZED VIEW, LOCK TABLE), and Supabase's default privileges grant
-- it to anon and authenticated on every public relation. The previous migration's revoke list was
-- written from the older privilege set, so it left this one. Like TRUNCATE it is not governed by RLS
-- and PostgREST does not expose it, so it only matters to a direct connection. Nothing in the app
-- uses it.
--
-- What this does and does not close: VACUUM, ANALYZE, REINDEX, CLUSTER and REFRESH MATERIALIZED VIEW
-- by a client role are gone. A signed-in role can STILL take LOCK TABLE ... ACCESS EXCLUSIVE, because
-- that lock is also allowed with UPDATE or DELETE privilege, which the app needs. (anon cannot: it
-- now holds SELECT only.) Verified in a rolled-back transaction on production.
--
-- Production 2026-10-16: anon held MAINTAIN on 83 relations, authenticated on 85.

do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('revoke maintain on table public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

alter default privileges for role postgres in schema public
  revoke maintain on tables from anon, authenticated;
