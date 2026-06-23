-- Fix semantic feed taste-vector selection.
--
-- Supabase lint rejects ordering directly inside the aggregate query that builds
-- the average embedding. Limit the candidate rows first, then aggregate them.

create or replace function public.get_semantic_feed(
  p_user_id uuid,
  p_limit   int default 20
)
returns table (
  id              uuid,
  author_id       uuid,
  title           text,
  prompt          text,
  response        text,
  likes_count     int,
  comment_count   int,
  repost_count    int,
  view_count      int,
  remix_count     int,
  created_at      timestamptz,
  media_urls      text[],
  quoted_echo_id  uuid,
  parent_echo_id  uuid,
  remix_root_id   uuid,
  username        text,
  display_name    text,
  bio             text,
  avatar_color    text,
  avatar_url      text,
  is_verified     bool,
  follower_count  int,
  distance        float8
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  taste vector(768);
begin
  select avg(recent_likes.embedding)::vector(768)
    into taste
    from (
      select e.embedding
      from public.echo_likes l
      join public.public_echoes e on e.id = l.echo_id
      where l.user_id = p_user_id
        and e.embedding is not null
        and e.check_content = true
      order by l.created_at desc
      limit 20
    ) recent_likes;

  if taste is null then
    select avg(recent_activity.embedding)::vector(768)
      into taste
      from (
        select e.embedding
        from (
          select echo_id, created_at
          from public.echo_views
          where user_id = p_user_id

          union all

          select id as echo_id, created_at
          from public.public_echoes
          where author_id = p_user_id
        ) src
        join public.public_echoes e on e.id = src.echo_id
        where e.embedding is not null
          and e.check_content = true
        order by src.created_at desc
        limit 20
      ) recent_activity;
  end if;

  if taste is null then
    return query
      select
        e.id, e.author_id, e.title, e.prompt, e.response,
        e.likes_count, e.comment_count, e.repost_count, e.view_count,
        e.remix_count, e.created_at, e.media_urls, e.quoted_echo_id,
        e.parent_echo_id, e.remix_root_id,
        p.username, p.display_name, p.bio,
        p.avatar_color, p.avatar_url, p.is_verified, p.follower_count,
        1.0::float8 as distance
      from public.public_echoes e
      join public.profiles p on p.id = e.author_id
      where e.check_content = true
        and e.author_id <> p_user_id
        and not exists (
          select 1
          from public.user_blocks b
          where b.blocker_id = p_user_id
            and b.blocked_id = e.author_id
        )
        and not exists (
          select 1
          from public.user_mutes m
          where m.muter_id = p_user_id
            and m.muted_id = e.author_id
        )
      order by (e.likes_count + e.comment_count * 2 + e.repost_count * 2) desc,
               e.created_at desc
      limit p_limit;
    return;
  end if;

  return query
    select
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.remix_count, e.created_at, e.media_urls, e.quoted_echo_id,
      e.parent_echo_id, e.remix_root_id,
      p.username, p.display_name, p.bio,
      p.avatar_color, p.avatar_url, p.is_verified, p.follower_count,
      (e.embedding <=> taste)::float8 as distance
    from public.public_echoes e
    join public.profiles p on p.id = e.author_id
    where e.embedding is not null
      and e.check_content = true
      and e.author_id <> p_user_id
      and not exists (
        select 1
        from public.user_blocks b
        where b.blocker_id = p_user_id
          and b.blocked_id = e.author_id
      )
      and not exists (
        select 1
        from public.user_mutes m
        where m.muter_id = p_user_id
          and m.muted_id = e.author_id
      )
    order by e.embedding <=> taste asc, e.created_at desc
    limit p_limit;
end;
$$;

grant execute on function public.get_semantic_feed(uuid, int) to authenticated;
