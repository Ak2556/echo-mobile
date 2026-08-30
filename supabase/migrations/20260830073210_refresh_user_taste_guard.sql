-- Fix round 1 on refresh_user_taste (introduced 20260830072647):
--   1. top_authors subquery was missing the check_content = true filter that
--      the taste-vector subquery already had, letting unmoderated/flagged
--      likes influence top_authors.
--   2. The function trusted a caller-supplied p_user_id with no ownership
--      check, so any authenticated caller could force a recompute/overwrite
--      of another user's user_taste row (bypassing its owner-only RLS) and
--      churn that row's updated_at, which the feed's lazy-refresh staleness
--      check reads. Guard the call to the caller's own uid or service_role.
create or replace function public.refresh_user_taste(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_taste   extensions.vector(768);
  v_authors uuid[];
begin
  if auth.uid() is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
  then
    raise exception 'refresh_user_taste: not authorized for another user';
  end if;

  select avg(src.embedding)::extensions.vector(768)
    into v_taste
    from (
      select e.embedding
        from public.echo_likes l
        join public.public_echoes e on e.id = l.echo_id
       where l.user_id = p_user_id
         and e.embedding is not null
         and e.check_content = true
       order by l.created_at desc
       limit 20
    ) src;

  select array_agg(t.author_id order by t.c desc)
    into v_authors
    from (
      select e.author_id, count(*) as c
        from public.echo_likes l
        join public.public_echoes e on e.id = l.echo_id
       where l.user_id = p_user_id
         and e.check_content = true
       group by e.author_id
       order by c desc
       limit 10
    ) t;

  insert into public.user_taste (user_id, taste_vector, top_authors, updated_at)
  values (p_user_id, v_taste, coalesce(v_authors, '{}'), now())
  on conflict (user_id) do update
    set taste_vector = excluded.taste_vector,
        top_authors  = excluded.top_authors,
        updated_at   = now();
end;
$$;

revoke all on function public.refresh_user_taste(uuid) from public, anon;
grant execute on function public.refresh_user_taste(uuid) to authenticated, service_role;
