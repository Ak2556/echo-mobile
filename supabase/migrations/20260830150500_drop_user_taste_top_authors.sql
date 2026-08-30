-- Second fix wave, M3 -- user_taste.top_authors is dead state.
--
-- refresh_user_taste computed and stored top_authors (up to 10 authors the
-- user has liked most), but get_personal_feed never reads the column -- the
-- `aff` lateral in get_personal_feed already expresses "how much has this
-- viewer engaged with this author" live and correctly (and, as of
-- 20260830150000, over likes AND comments, not just likes). top_authors also
-- included the user's own id whenever they had liked their own posts, since
-- refresh_user_taste never excluded self-authored likes from that
-- computation. Verified before dropping: no application code (TypeScript or
-- SQL) references user_taste.top_authors -- it was written and never read.
--
-- Decision: stop storing it, per the brief's recommendation. Dead state that
-- looks meaningful is worse than no state, and keeping it around risks a
-- future caller double-counting the same affinity signal the live lateral
-- already covers.
--
-- refresh_user_taste is rewritten to drop the top_authors computation and
-- its column in the insert/upsert; everything else (the ownership guard from
-- 20260830073210, the check_content-filtered taste-vector average, the
-- search_path) is unchanged.

alter table public.user_taste drop column if exists top_authors;

create or replace function public.refresh_user_taste(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_taste extensions.vector(768);
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

  insert into public.user_taste (user_id, taste_vector, updated_at)
  values (p_user_id, v_taste, now())
  on conflict (user_id) do update
    set taste_vector = excluded.taste_vector,
        updated_at   = now();
end;
$$;

revoke all on function public.refresh_user_taste(uuid) from public, anon;
grant execute on function public.refresh_user_taste(uuid) to authenticated, service_role;
