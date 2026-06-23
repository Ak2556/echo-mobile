-- Echo: AI-native discovery RPCs
--   get_semantic_feed       -> cosine-similarity feed tuned to the user's taste vector
--   get_similar_echoes      -> "more like this" rail under any echo
--   get_trending_evolutions -> trending remix lineages for the Evolutions tab
--   get_remix_tree          -> flat list of an evolution lineage for the tree viewer
--
-- All return the same shape as get_ranked_feed so the client can reuse
-- the existing FeedCard/EchoCard renderers.

-- Semantic feed (For You)
-- Builds a "taste vector" from the user's last 20 likes (falls back to last
-- 20 viewed/published echoes if no likes yet) and ranks public_echoes by
-- cosine distance. If the user has zero embedding signal at all, returns
-- engagement-ranked recent echoes so the feed is never empty.
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
  -- Average the embeddings of the user's recent likes.
  select avg(e.embedding)::vector(768)
    into taste
    from public.echo_likes l
    join public.public_echoes e on e.id = l.echo_id
    where l.user_id = p_user_id
      and e.embedding is not null
    order by l.created_at desc
    limit 20;

  -- Fall back to recent views / own publishes if no liked embeddings yet.
  if taste is null then
    select avg(e.embedding)::vector(768)
      into taste
      from (
        select echo_id, created_at from public.echo_views where user_id = p_user_id
        union all
        select id as echo_id, created_at from public.public_echoes where author_id = p_user_id
      ) src
      join public.public_echoes e on e.id = src.echo_id
      where e.embedding is not null
      order by src.created_at desc
      limit 20;
  end if;

  -- No signal at all -> degrade gracefully to engagement-ranked recent echoes.
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
      where e.author_id <> p_user_id
        and not exists (
          select 1 from public.user_blocks b
          where b.blocker_id = p_user_id and b.blocked_id = e.author_id
        )
        and not exists (
          select 1 from public.user_mutes m
          where m.muter_id = p_user_id and m.muted_id = e.author_id
        )
      order by (e.likes_count + e.comment_count * 2 + e.repost_count * 2) desc,
               e.created_at desc
      limit p_limit;
    return;
  end if;

  -- Main path: cosine-distance ranking against the taste vector.
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
      and e.author_id <> p_user_id
      and not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = p_user_id and b.blocked_id = e.author_id
      )
      and not exists (
        select 1 from public.user_mutes m
        where m.muter_id = p_user_id and m.muted_id = e.author_id
      )
    order by e.embedding <=> taste asc, e.created_at desc
    limit p_limit;
end;
$$;

-- Similar echoes ("more like this" rail)
create or replace function public.get_similar_echoes(
  p_echo_id uuid,
  p_limit   int default 8
)
returns table (
  id             uuid,
  author_id      uuid,
  title          text,
  prompt         text,
  response       text,
  likes_count    int,
  comment_count  int,
  repost_count   int,
  view_count     int,
  remix_count    int,
  created_at     timestamptz,
  media_urls     text[],
  parent_echo_id uuid,
  remix_root_id  uuid,
  username       text,
  display_name   text,
  avatar_color   text,
  avatar_url     text,
  is_verified    bool,
  distance       float8
)
language sql stable security definer
set search_path = public
as $$
  with anchor as (
    select embedding from public.public_echoes where id = p_echo_id
  )
  select
    e.id, e.author_id, e.title, e.prompt, e.response,
    e.likes_count, e.comment_count, e.repost_count, e.view_count,
    e.remix_count, e.created_at, e.media_urls,
    e.parent_echo_id, e.remix_root_id,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified,
    (e.embedding <=> (select embedding from anchor))::float8 as distance
  from public.public_echoes e
  join public.profiles p on p.id = e.author_id
  where e.id <> p_echo_id
    and e.embedding is not null
    and (select embedding from anchor) is not null
  order by e.embedding <=> (select embedding from anchor) asc
  limit p_limit;
$$;

-- Trending evolutions (Evolutions tab)
-- Returns one row per remix_root_id ranked by aggregate engagement across the
-- entire remix tree (root + every descendant). The root's own metadata is
-- joined back so the tab can render the seed conversation as a hero card.
create or replace function public.get_trending_evolutions(
  p_limit int default 20
)
returns table (
  root_id          uuid,
  root_title       text,
  root_prompt      text,
  root_response    text,
  root_created_at  timestamptz,
  root_media_urls  text[],
  root_author_id   uuid,
  root_username    text,
  root_display_name text,
  root_avatar_color text,
  root_avatar_url   text,
  root_is_verified  bool,
  branch_count      int,
  unique_authors    int,
  tree_engagement   bigint,
  newest_remix_at   timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with tree as (
    select
      coalesce(remix_root_id, id) as root_id,
      author_id,
      likes_count + comment_count * 2 + repost_count * 2 as eng,
      created_at,
      parent_echo_id
    from public.public_echoes
  ),
  agg as (
    select
      root_id,
      count(*) filter (where parent_echo_id is not null) as branch_count,
      count(distinct author_id) as unique_authors,
      sum(eng)::bigint as tree_engagement,
      max(case when parent_echo_id is not null then created_at end) as newest_remix_at
    from tree
    group by root_id
    having count(*) filter (where parent_echo_id is not null) >= 1
  )
  select
    a.root_id,
    r.title, r.prompt, r.response, r.created_at, r.media_urls, r.author_id,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified,
    a.branch_count::int, a.unique_authors::int, a.tree_engagement, a.newest_remix_at
  from agg a
  join public.public_echoes r on r.id = a.root_id
  join public.profiles p on p.id = r.author_id
  order by a.tree_engagement desc, a.newest_remix_at desc nulls last
  limit p_limit;
$$;

-- Remix tree (flat list for tree viewer)
-- Returns the root + every descendant of a remix lineage with a depth column.
-- Client renders an indented list ordered by depth, then by engagement.
create or replace function public.get_remix_tree(
  p_root_id uuid
)
returns table (
  id              uuid,
  parent_echo_id  uuid,
  depth           int,
  author_id       uuid,
  title           text,
  prompt          text,
  response        text,
  likes_count     int,
  comment_count   int,
  repost_count    int,
  remix_count     int,
  created_at      timestamptz,
  media_urls      text[],
  username        text,
  display_name    text,
  avatar_color    text,
  avatar_url      text,
  is_verified     bool
)
language sql stable security definer
set search_path = public
as $$
  with recursive lineage as (
    select e.*, 0 as depth
      from public.public_echoes e
      where e.id = p_root_id
    union all
    select e.*, l.depth + 1
      from public.public_echoes e
      join lineage l on e.parent_echo_id = l.id
      where l.depth < 8
  )
  select
    l.id, l.parent_echo_id, l.depth,
    l.author_id, l.title, l.prompt, l.response,
    l.likes_count, l.comment_count, l.repost_count, l.remix_count,
    l.created_at, l.media_urls,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified
  from lineage l
  join public.profiles p on p.id = l.author_id
  order by l.depth asc,
           (l.likes_count + l.comment_count * 2 + l.repost_count * 2) desc,
           l.created_at desc;
$$;

grant execute on function public.get_semantic_feed(uuid, int)        to authenticated;
grant execute on function public.get_similar_echoes(uuid, int)       to authenticated, anon;
grant execute on function public.get_trending_evolutions(int)        to authenticated, anon;
grant execute on function public.get_remix_tree(uuid)                to authenticated, anon;
