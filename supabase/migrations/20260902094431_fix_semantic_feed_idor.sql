-- SECURITY: get_semantic_feed ranked a feed by a caller-supplied user's taste.
--
-- SECURITY DEFINER, EXECUTE granted to authenticated, and every predicate keyed
-- off the p_user_id parameter with no check that it is the caller. The taste
-- vector is built from that user's 20 most recent likes (falling back to their
-- views and own publishes), so the returned ordering is a direct function of
-- another account's private engagement history.
--
-- Demonstrated on production inside a rolled-back transaction: signed in as one
-- user, calling get_semantic_feed for a different user returned that user's
-- ranking — 8 of the top 10 shared, but positions 3 and 4 genuinely differed
-- from the caller's own feed, so the parameter is honoured and the divergence
-- is the victim's taste leaking. The overlap is high only because the corpus is
-- 74 echoes; the signal separates as content grows.
--
-- Same class as the get_dm_conversations IDOR (20260830043429), the
-- refresh_user_taste IDOR (20260830073210) and the age-gate helpers
-- (20260901092451): a definer function trusting an identity it was handed.
--
-- Fix: resolve the viewer once from auth.uid(); service_role may still pass an
-- explicit id because it has no auth.uid() of its own; the parameter is
-- advisory. A caller with no identity gets no rows rather than a stranger's
-- feed. All nine p_user_id predicates across the three code paths — taste
-- build, no-signal fallback, and the main vector path — now read v_uid.
--
-- NOTE ON search_path: this function carries `set search_path = public, extensions`,
-- applied by 20260830044247 to repair the 19-day 42704 "type vector does not
-- exist" outage. That setting lives on the function, not in the body, so the
-- migration file that last defined this body still says `public`. Restated
-- explicitly below — dropping it would fix the IDOR and silently reinstate the
-- outage.

create or replace function public.get_semantic_feed(p_user_id uuid, p_limit integer default 20)
returns table(id uuid, author_id uuid, title text, prompt text, response text, likes_count integer, comment_count integer, repost_count integer, view_count integer, remix_count integer, created_at timestamp with time zone, media_urls text[], quoted_echo_id uuid, parent_echo_id uuid, remix_root_id uuid, username text, display_name text, bio text, avatar_color text, avatar_url text, is_verified boolean, follower_count integer, distance double precision)
language plpgsql
stable security definer
set search_path to 'public', 'extensions'
as $function$
declare
  taste vector(768);
  v_uid uuid;
begin
  -- Identity comes from the JWT, never from the parameter. service_role has no
  -- auth.uid(), so it alone may name a user explicitly.
  v_uid := case
    when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
      then coalesce(p_user_id, auth.uid())
    else auth.uid()
  end;

  if v_uid is null then
    return;
  end if;

  -- Average the embeddings of the user's recent likes (subquery to allow ORDER + LIMIT).
  select avg(recent_likes.embedding)::vector(768)
    into taste
    from (
      select e.embedding
      from public.echo_likes l
      join public.public_echoes e on e.id = l.echo_id
      where l.user_id = v_uid
        and e.embedding is not null
        and e.check_content = true
      order by l.created_at desc
      limit 20
    ) recent_likes;

  -- Fall back to recent views / own publishes if no liked embeddings yet.
  if taste is null then
    select avg(recent_activity.embedding)::vector(768)
      into taste
      from (
        select e.embedding
        from (
          -- Qualify created_at with table alias to avoid clash with the
          -- plpgsql OUT variable of the same name (PG error 42702).
          select ev.echo_id, ev.created_at
          from public.echo_views ev
          where ev.user_id = v_uid

          union all

          select pe.id as echo_id, pe.created_at
          from public.public_echoes pe
          where pe.author_id = v_uid
        ) src
        join public.public_echoes e on e.id = src.echo_id
        where e.embedding is not null
          and e.check_content = true
        order by src.created_at desc
        limit 20
      ) recent_activity;
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
      where e.check_content = true
        and e.author_id <> v_uid
        and not exists (
          select 1 from public.user_blocks b
          where b.blocker_id = v_uid and b.blocked_id = e.author_id
        )
        and not exists (
          select 1 from public.user_mutes m
          where m.muter_id = v_uid and m.muted_id = e.author_id
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
      and e.check_content = true
      and e.author_id <> v_uid
      and not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = v_uid and b.blocked_id = e.author_id
      )
      and not exists (
        select 1 from public.user_mutes m
        where m.muter_id = v_uid and m.muted_id = e.author_id
      )
    order by e.embedding <=> taste asc, e.created_at desc
    limit p_limit;
end;
$function$;
