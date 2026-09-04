-- Backend performance, tier 2: make auth.uid() an InitPlan.
--
-- 179 RLS policies called auth.uid() directly. Postgres treats it as volatile in
-- that position and re-evaluates it FOR EVERY ROW the policy is checked against.
-- Wrapping it as (select auth.uid()) lets the planner hoist it into an InitPlan
-- evaluated once per query. On a feed page scanning thousands of public_echoes
-- rows that is thousands of function calls collapsed into one. This was the
-- single largest scale cost in the database, and the wrap is the documented fix
-- (advisor lint 0003_auth_rls_initplan).
--
-- Rewritten programmatically from pg_policies rather than by hand, so every
-- policy is reconstructed from its own stored definition — same name, same
-- permissive/restrictive kind, same command, same roles, same expressions. The
-- ONLY textual change is the wrap.
--
-- Verified in a rolled-back transaction before applying: 215 policies before,
-- 215 after, all 215 matched by name, 0 semantic drift once the wrap is
-- normalised away on both sides. Verified again after applying, plus a
-- functional check that a signed-in user can still read their own notifications
-- and can read zero rows belonging to another user.
--
-- Idempotent: existing wraps are unwrapped first, then everything is wrapped
-- once, so re-running cannot produce (select (select auth.uid())).

do $$
declare
  p record;
  q text;
  wc text;
  roles_csv text;
  stmt text;
  n int := 0;
begin
  for p in
    select * from pg_policies
    where schemaname = 'public'
      and ( qual like '%auth.uid()%' or with_check like '%auth.uid()%' )
  loop
    -- Postgres re-renders a wrapped call as "( SELECT auth.uid() AS uid)", so
    -- the unwrap pattern must tolerate the alias it adds. Getting this wrong is
    -- what makes a naive version of this migration non-idempotent.
    q  := regexp_replace(coalesce(p.qual, ''),
                         '\(\s*SELECT\s+auth\.uid\(\)(\s+AS\s+\w+)?\s*\)', 'auth.uid()', 'gi');
    q  := replace(q, 'auth.uid()', '(select auth.uid())');

    wc := regexp_replace(coalesce(p.with_check, ''),
                         '\(\s*SELECT\s+auth\.uid\(\)(\s+AS\s+\w+)?\s*\)', 'auth.uid()', 'gi');
    wc := replace(wc, 'auth.uid()', '(select auth.uid())');

    select string_agg(quote_ident(r), ', ') into roles_csv
    from unnest(p.roles::text[]) as r;

    execute format('drop policy %I on public.%I', p.policyname, p.tablename);

    stmt := format('create policy %I on public.%I as %s for %s to %s',
                   p.policyname,
                   p.tablename,
                   case when p.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                   p.cmd,
                   roles_csv);
    if nullif(q, '')  is not null then stmt := stmt || format(' using (%s)', q); end if;
    if nullif(wc, '') is not null then stmt := stmt || format(' with check (%s)', wc); end if;

    execute stmt;
    n := n + 1;
  end loop;

  raise notice 'wrapped auth.uid() in % policies', n;
end $$;
