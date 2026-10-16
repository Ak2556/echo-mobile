-- Table privileges nobody uses, taken away. Defence in depth: row-level security already refuses
-- every write these grants would allow, so nothing changes for the app.
--
-- Supabase's default privileges hand anon and authenticated ALL on every table created in `public`.
-- RLS is the only thing then standing between a client and the data, and it does not cover TRUNCATE
-- at all (RLS applies to SELECT, INSERT, UPDATE and DELETE; a role with TRUNCATE can empty the table).
-- PostgREST does not expose TRUNCATE, so this is not reachable over HTTP today; it is one
-- misconfigured connection or function away from being a data-loss bug.
--
-- Checked on production 2026-10-16 before writing this:
--   * no INSERT/UPDATE/DELETE/ALL policy on `public` can apply to anon without an identity test
--     (auth.uid(), can_view_*, ...); none names the anon role; none mentions it in its condition;
--   * the 19 functions anon can execute are read-only helpers or invoker functions that RLS confines;
--   * the one signed-out-looking client write (signup-wizard.tsx, profiles upsert) runs after the
--     OTP is verified, so it is an authenticated request.
--
-- anon:           keeps SELECT (signed-out reads of public content); loses INSERT, UPDATE, DELETE,
--                 TRUNCATE, REFERENCES, TRIGGER.
-- authenticated:  keeps SELECT, INSERT, UPDATE, DELETE (RLS governs them); loses TRUNCATE,
--                 REFERENCES, TRIGGER.
-- Views: read-only for both roles. All three public views are security_invoker (checked), so they do
-- not bypass RLS; their write grants were simply never meant to exist.

do $$
declare
  t record;
begin
  for t in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')
  loop
    if t.relkind = 'v' then
      execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from anon, authenticated', t.relname);
    else
      execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from anon', t.relname);
      execute format('revoke truncate, references, trigger on table public.%I from authenticated', t.relname);
    end if;
  end loop;
end $$;

-- Without this, every table created after today gets the full set back (that is how the count
-- drifted from 80 to 82). Tables made by migrations are owned by postgres.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;
