-- Recomputes one user's taste vector from their 20 most recent likes.
-- SECURITY DEFINER because it writes user_taste, whose RLS policy is read-only
-- to the owner. search_path MUST include extensions or vector(768) fails to
-- resolve (42704).
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
