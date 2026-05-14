-- ─── follower_count denormalization ──────────────────────────────────────────
-- Kept on profiles so ranking queries avoid a COUNT subquery per row.

alter table public.profiles
  add column if not exists follower_count int not null default 0;

update public.profiles p
  set follower_count = (
    select count(*)::int from public.follows f where f.following_id = p.id
  );

create or replace function public.adjust_follower_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update public.profiles
      set follower_count = follower_count + 1
      where id = new.following_id;
  elsif TG_OP = 'DELETE' then
    update public.profiles
      set follower_count = greatest(follower_count - 1, 0)
      where id = old.following_id;
  end if;
  return null;
end;
$$;

drop trigger if exists follows_adjust_follower_count on public.follows;
create trigger follows_adjust_follower_count
  after insert or delete on public.follows
  for each row execute function public.adjust_follower_count();

-- ─── Ranked feed RPC ─────────────────────────────────────────────────────────
-- Returns posts scored by a Hacker News–style gravity formula personalised for
-- the requesting user.  All blocking, muting and scope filtering happens here
-- so the client receives a clean, ready-to-render list.
--
-- Score formula (per post):
--   base     = (likes×3 + comments×5 + reposts×4 + views×0.3)
--              ─────────────────────────────────────────────────
--              (age_hours + 2) ^ gravity          ← time decay
--
--   × engagement_rate_boost  = 1 + (likes+comments+reposts) / max(views,1) × 2
--   × author_authority       = 1 + log(follower_count+1) / 10    ← log-scale
--   × media_boost            = 1.2 if post has media, else 1.0
--   × follow_boost           = 1.5 if current user follows author, else 1.0
--
-- Gravity guide:  1.8 → recency-heavy (home "latest")
--                 1.0 → engagement-heavy (explore "popular")

create or replace function public.get_ranked_feed(
  p_user_id        uuid    default null,
  p_limit          int     default 20,
  p_gravity        float8  default 1.8,
  p_cursor_score   float8  default null,
  p_cursor_id      uuid    default null,
  p_following_only boolean default false
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
  created_at     timestamptz,
  media_urls     text[],
  quoted_echo_id uuid,
  username       text,
  display_name   text,
  bio            text,
  avatar_color   text,
  avatar_url     text,
  is_verified    bool,
  follower_count int,
  rank_score     float8
)
language sql stable security definer
set search_path = public
as $$
  with scored as (
    select
      e.id,
      e.author_id,
      e.title,
      e.prompt,
      e.response,
      e.likes_count,
      e.comment_count,
      e.repost_count,
      e.view_count,
      e.created_at,
      e.media_urls,
      e.quoted_echo_id,
      p.username,
      p.display_name,
      p.bio,
      p.avatar_color,
      p.avatar_url,
      p.is_verified,
      p.follower_count,
      (
        (e.likes_count * 3.0 + e.comment_count * 5.0 + e.repost_count * 4.0 + e.view_count * 0.3)
        / power(
            greatest(extract(epoch from (now() - e.created_at)) / 3600.0, 0.1) + 2.0,
            p_gravity
          )
        * (1.0 + (e.likes_count + e.comment_count + e.repost_count)::float8
               / greatest(e.view_count, 1) * 2.0)
        * (1.0 + log(greatest(p.follower_count::float8 + 1.0, 1.0)) / 10.0)
        * case
            when e.media_urls is not null and array_length(e.media_urls, 1) > 0
            then 1.2 else 1.0
          end
        * case
            when p_user_id is not null and exists (
              select 1 from public.follows f
              where f.follower_id = p_user_id and f.following_id = e.author_id
            ) then 1.5 else 1.0
          end
      ) as rank_score
    from public.public_echoes e
    join public.profiles p on p.id = e.author_id
    where
      -- block / mute filters
      (p_user_id is null or not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = p_user_id and b.blocked_id = e.author_id
      ))
      and (p_user_id is null or not exists (
        select 1 from public.user_mutes m
        where m.muter_id = p_user_id and m.muted_id = e.author_id
      ))
      -- following-only scope
      and (
        not p_following_only
        or p_user_id is null
        or exists (
          select 1 from public.follows f2
          where f2.follower_id = p_user_id and f2.following_id = e.author_id
        )
      )
  )
  select
    s.id, s.author_id, s.title, s.prompt, s.response,
    s.likes_count, s.comment_count, s.repost_count, s.view_count,
    s.created_at, s.media_urls, s.quoted_echo_id,
    s.username, s.display_name, s.bio, s.avatar_color, s.avatar_url,
    s.is_verified, s.follower_count, s.rank_score
  from scored s
  where
    -- keyset pagination: continue after (score DESC, id DESC) cursor
    p_cursor_score is null
    or s.rank_score < p_cursor_score
    or (s.rank_score = p_cursor_score and s.id < p_cursor_id)
  order by s.rank_score desc, s.id desc
  limit p_limit;
$$;

-- ─── Supporting indexes ───────────────────────────────────────────────────────

create index if not exists public_echoes_engagement_idx
  on public.public_echoes (likes_count desc, comment_count desc, repost_count desc, created_at desc);

create index if not exists profiles_follower_count_idx
  on public.profiles (follower_count desc);
