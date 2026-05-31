-- Daily Prompt divergence.
--
-- The Daily Question is a shared prompt everyone answers. Most apps would show
-- those answers as a flat chronological list. Echo instead embeds each answer
-- (768-d, via the embed-daily-answer edge function) and uses those vectors to
-- surface the takes that diverge MOST from the day's consensus — the contrarian
-- and most-distinctive answers float to the top.
--
-- "Divergence" = cosine distance between an answer's embedding and the centroid
-- (average) of all of today's embedded answers. Larger distance = further from
-- the crowd. We exclude the viewer's own answer and anyone they block/mute.

-- 1. Embedding column on daily_answers (mirrors public_echoes.embedding).
alter table public.daily_answers
  add column if not exists embedding vector(768);

-- 2. Divergence-ranking RPC.
create or replace function public.get_divergent_daily_answers(
  p_question_id uuid,
  p_viewer_id   uuid default null,
  p_limit       int  default 30
)
returns table (
  id            uuid,
  user_id       uuid,
  answer        text,
  echo_id       uuid,
  created_at    timestamptz,
  username      text,
  display_name  text,
  avatar_color  text,
  avatar_url    text,
  is_verified   bool,
  divergence    float8   -- cosine distance from the day's consensus (0..2); higher = more divergent
)
language sql stable security definer
set search_path = public
as $$
  with answers as (
    select a.id, a.user_id, a.answer, a.echo_id, a.created_at, a.embedding
    from public.daily_answers a
    where a.question_id = p_question_id
      and a.embedding is not null
  ),
  consensus as (
    select avg(embedding)::vector(768) as centroid
    from answers
  )
  select
    a.id,
    a.user_id,
    a.answer,
    a.echo_id,
    a.created_at,
    p.username,
    p.display_name,
    p.avatar_color,
    p.avatar_url,
    p.is_verified,
    (a.embedding <=> c.centroid)::float8 as divergence
  from answers a
  join consensus c on true
  join public.profiles p on p.id = a.user_id
  where c.centroid is not null
    and (p_viewer_id is null or a.user_id <> p_viewer_id)
    and (p_viewer_id is null or not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = p_viewer_id and b.blocked_id = a.user_id
    ))
    and (p_viewer_id is null or not exists (
      select 1 from public.user_mutes m
      where m.muter_id = p_viewer_id and m.muted_id = a.user_id
    ))
  order by (a.embedding <=> c.centroid) desc   -- most divergent first
  limit p_limit;
$$;

grant execute on function public.get_divergent_daily_answers(uuid, uuid, int) to authenticated, anon;
