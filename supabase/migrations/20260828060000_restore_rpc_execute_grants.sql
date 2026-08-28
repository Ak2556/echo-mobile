-- Restore EXECUTE on RPCs the app calls but can no longer run.
--
-- 20260811030000_fix_supabase_linter_warnings_part3 revoked EXECUTE from
-- PUBLIC and anon for 39 functions, to clear the linter's
-- anon_security_definer_function_executable warning. That part was right.
--
-- What it missed is that `authenticated` was reaching most of those functions
-- *through* PUBLIC. Revoking PUBLIC therefore removed access for signed-in
-- users too, and only some functions were given an explicit grant afterwards.
-- get_thinking_partners was not, so the Minds screen has been answering
--
--     42501  permission denied for function get_thinking_partners
--
-- for every user since that migration ran.
--
-- Cross-referencing the 39 revoked functions against the RPCs the client
-- actually calls leaves exactly two without an explicit grant in the
-- migrations: get_thinking_partners and get_ranked_feed. The feed demonstrably
-- works, so the live database has a grant for get_ranked_feed that the
-- migrations do not record — worth knowing, and a reason to state it here
-- rather than assume the files describe production. Granting it again is
-- harmless either way; GRANT is idempotent.
--
-- Trigger and cron functions in that revoked list (adjust_*, enforce_*,
-- moderate_new_echo, resweep_unmoderated_echoes and friends) are deliberately
-- left alone. They are invoked by the database, not by a signed-in role, and
-- granting them to `authenticated` would hand users a direct call to internals
-- that the linter warning existed to close off.
--
-- Signatures are discovered rather than written out. The migrations have
-- already drifted from the deployed schema once, and a hardcoded argument list
-- that no longer matches would fail silently by matching nothing.

do $$
declare
  target text;
  r record;
  found int;
begin
  foreach target in array array['get_thinking_partners', 'get_ranked_feed']
  loop
    found := 0;
    for r in
      select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = target
    loop
      execute format('grant execute on function %s to authenticated', r.sig);
      found := found + 1;
    end loop;

    if found = 0 then
      -- Not fatal: the function may simply not exist in this environment.
      raise notice 'restore_rpc_execute_grants: no function named public.% found', target;
    else
      raise notice 'restore_rpc_execute_grants: granted execute on % overload(s) of public.%', found, target;
    end if;
  end loop;
end $$;
