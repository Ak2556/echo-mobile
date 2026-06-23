-- Perspective metadata turns remix lineage into Echo's signature "Add Perspective"
-- loop while preserving existing parent_echo_id / remix_root_id behavior.

alter table public.public_echoes
  add column if not exists perspective_type text,
  add column if not exists perspective_note text,
  add column if not exists source_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'public_echoes_perspective_type_check'
      and conrelid = 'public.public_echoes'::regclass
  ) then
    alter table public.public_echoes
      add constraint public_echoes_perspective_type_check
      check (
        perspective_type is null
        or perspective_type in ('agree', 'challenge', 'reframe', 'story', 'evidence', 'question')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'public_echoes_source_url_check'
      and conrelid = 'public.public_echoes'::regclass
  ) then
    alter table public.public_echoes
      add constraint public_echoes_source_url_check
      check (
        source_url is null
        or source_url ~* '^https?://'
      );
  end if;
end $$;

create index if not exists public_echoes_perspective_type_idx
  on public.public_echoes (perspective_type)
  where parent_echo_id is not null;

drop function if exists public.get_trending_evolutions(int);

create function public.get_trending_evolutions(
  p_limit int default 20
)
returns table (
  root_id           uuid,
  root_title        text,
  root_prompt       text,
  root_response     text,
  root_created_at   timestamptz,
  root_media_urls   text[],
  root_author_id    uuid,
  root_username     text,
  root_display_name text,
  root_avatar_color text,
  root_avatar_url   text,
  root_is_verified  bool,
  branch_count      int,
  agree_count       int,
  challenge_count   int,
  reframe_count     int,
  story_count       int,
  evidence_count    int,
  question_count    int,
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
      parent_echo_id,
      coalesce(perspective_type, 'reframe') as perspective_type
    from public.public_echoes
    where check_content = true
  ),
  agg as (
    select
      root_id,
      count(*) filter (where parent_echo_id is not null) as branch_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'agree') as agree_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'challenge') as challenge_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'reframe') as reframe_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'story') as story_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'evidence') as evidence_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'question') as question_count,
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
    a.branch_count::int,
    a.agree_count::int,
    a.challenge_count::int,
    a.reframe_count::int,
    a.story_count::int,
    a.evidence_count::int,
    a.question_count::int,
    a.unique_authors::int,
    a.tree_engagement,
    a.newest_remix_at
  from agg a
  join public.public_echoes r on r.id = a.root_id and r.check_content = true
  join public.profiles p on p.id = r.author_id
  order by a.tree_engagement desc, a.newest_remix_at desc nulls last
  limit p_limit;
$$;

drop function if exists public.get_remix_tree(uuid);

create function public.get_remix_tree(
  p_root_id uuid
)
returns table (
  id               uuid,
  parent_echo_id   uuid,
  depth            int,
  author_id        uuid,
  title            text,
  prompt           text,
  response         text,
  likes_count      int,
  comment_count    int,
  repost_count     int,
  remix_count      int,
  perspective_type text,
  perspective_note text,
  source_url       text,
  created_at       timestamptz,
  media_urls       text[],
  username         text,
  display_name     text,
  avatar_color     text,
  avatar_url       text,
  is_verified      bool
)
language sql stable security definer
set search_path = public
as $$
  with recursive lineage as (
    select e.*, 0 as depth
      from public.public_echoes e
     where e.id = p_root_id
       and e.check_content = true
    union all
    select e.*, l.depth + 1
      from public.public_echoes e
      join lineage l on e.parent_echo_id = l.id
     where l.depth < 8
       and e.check_content = true
  )
  select
    l.id, l.parent_echo_id, l.depth,
    l.author_id, l.title, l.prompt, l.response,
    l.likes_count, l.comment_count, l.repost_count, l.remix_count,
    case when l.parent_echo_id is null then null else coalesce(l.perspective_type, 'reframe') end,
    l.perspective_note,
    l.source_url,
    l.created_at, l.media_urls,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified
  from lineage l
  join public.profiles p on p.id = l.author_id
  order by l.depth asc,
           (l.likes_count + l.comment_count * 2 + l.repost_count * 2) desc,
           l.created_at desc;
$$;

grant execute on function public.get_trending_evolutions(int) to authenticated, anon;
grant execute on function public.get_remix_tree(uuid) to authenticated, anon;
