-- Wrap auth.uid() in a scalar subquery across every RLS policy.
--
-- Postgres treats a bare auth.uid() in a policy as volatile and re-evaluates it
-- for every row the query scans, as a SubPlan. Wrapping it as
-- (select auth.uid()) makes it an InitPlan: evaluated once per statement and
-- cached for the rest of it. The value is identical either way — this changes
-- how often the planner calls the function, not what any policy means.
--
-- The cost is invisible on small tables and becomes the dominant term as they
-- grow, which is exactly the wrong time to discover it. Audit of 2026-08-24
-- found 167 of 201 policies referencing auth.uid() and none of them wrapped.
--
-- Written as a loop over pg_policies rather than 167 hand-written ALTERs. The
-- rewrite is then mechanical and identical everywhere, there is no list to
-- fall out of date with the schema, and it applies equally to a fresh replay
-- and to production. Only auth.uid() appears in these policies — no auth.jwt()
-- or auth.role() — so one substitution covers the schema.
do $$
declare
  r        record;
  v_using  text;
  v_check  text;
  v_sql    text;
  v_count  int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and coalesce(qual, '') || coalesce(with_check, '') ~ 'auth\.uid\(\)'
       -- Skip anything already wrapped, so re-running cannot nest the subquery.
       and coalesce(qual, '') || coalesce(with_check, '') !~ '\( SELECT auth\.uid\(\)'
     order by tablename, policyname
  loop
    -- replace() on NULL yields NULL, so a policy without one of the clauses
    -- keeps it absent rather than gaining an empty one.
    v_using := replace(r.qual, 'auth.uid()', '(select auth.uid())');
    v_check := replace(r.with_check, 'auth.uid()', '(select auth.uid())');

    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    -- INSERT policies have only WITH CHECK; SELECT and DELETE have only USING;
    -- ALL and UPDATE can have both. Emit exactly the clauses that exist.
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
    v_count := v_count + 1;
  end loop;

  raise notice 'InitPlan rewrite: % policies updated', v_count;
end $$;

-- Fail the migration rather than report success on a partial rewrite.
do $$
declare v_left int;
begin
  select count(*) into v_left
    from pg_policies
   where schemaname = 'public'
     and coalesce(qual, '') || coalesce(with_check, '') ~ 'auth\.uid\(\)'
     and coalesce(qual, '') || coalesce(with_check, '') !~ '\( SELECT auth\.uid\(\)';

  if v_left > 0 then
    raise exception 'InitPlan rewrite incomplete: % policies still call auth.uid() directly', v_left;
  end if;
end $$;
