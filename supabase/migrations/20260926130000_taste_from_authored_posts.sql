-- Give the people who never picked an interest a taste vector anyway.
--
-- refresh_user_taste built from likes, fell back to stated interests, and
-- otherwise left taste_vector null. Null is not inert: the ranking term is
-- `0.6 * greatest(0, 1 - coalesce(e.embedding <=> v_taste, 1))`, so a null
-- vector makes the distance coalesce to 1 and the whole personalisation
-- component score 0. The feed still renders off recency, engagement and the
-- author-spread rules, which is exactly why nobody noticed that the
-- heaviest-weighted signal was switched off for part of the user base.
--
-- Who that is: anyone with no likes AND no stated interests. Until
-- 20260926120000 the signup wizard was unreachable for first-time Google and
-- Apple users — 'needs-onboarding' was decided by a flag handle_new_user()
-- always sets — so those accounts hold no user_interests rows at all. Their
-- interests were never collected and cannot be recovered retroactively.
--
-- But most of them have written something, and what a person writes is
-- evidence about what they want to read. So: a third fallback on their own
-- posts, which needs no prompt, no new screen and no second chance at
-- onboarding.
--
-- Deliberately last in the chain. A like is what someone chose to consume; a
-- stated interest is what they said; an authored post is only what they
-- produced, and producing is not the same as wanting to read. It is the
-- weakest of the three and is replaced the moment either stronger signal
-- exists — the function recomputes the whole chain from scratch each call.
--
-- No backfill job accompanies this, and none is needed. get_personal_feed
-- refreshes lazily under `v_updated is null or v_updated < now() - interval
-- '6 hours'`, so every user recomputes within six hours of their next feed
-- load, whatever their current seeded_from says.

create or replace function public.refresh_user_taste(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_taste  extensions.vector(768);
  v_source text;
begin
  if auth.uid() is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
  then
    raise exception 'refresh_user_taste: not authorized for another user';
  end if;

  -- What someone liked is the strongest evidence of what they want to read.
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

  if v_taste is not null then
    v_source := 'likes';
  else
    -- Nothing liked yet. Fall back to what they said they were interested in:
    -- the average of those labels' own vectors. A stated interest is weaker
    -- evidence than a like, which is why it is only ever the fallback, and it
    -- is replaced the moment a like exists.
    select avg(ie.embedding)::extensions.vector(768)
      into v_taste
      from public.user_interests ui
      join public.interest_embeddings ie on ie.interest = ui.interest
     where ui.user_id = p_user_id;

    if v_taste is not null then
      v_source := 'interests';
    else
      -- Never liked anything and never stated an interest. Read their own
      -- posts instead of giving up: the alternative is a null vector, and a
      -- null vector is not neutral — it zeroes the term outright.
      --
      -- Same filters as the likes branch, for the same reasons: an unembedded
      -- post contributes nothing to an average, and one that failed moderation
      -- should not steer a feed. Bounded at 20 so a prolific author costs the
      -- same as anyone else, and ordered newest-first so the vector tracks what
      -- they write about now rather than what they wrote about first.
      select avg(src.embedding)::extensions.vector(768)
        into v_taste
        from (
          select e.embedding
            from public.public_echoes e
           where e.author_id = p_user_id
             and e.embedding is not null
             and e.check_content = true
           order by e.created_at desc
           limit 20
        ) src;

      if v_taste is not null then v_source := 'authored'; end if;
    end if;
  end if;

  insert into public.user_taste (user_id, taste_vector, updated_at, seeded_from)
  values (p_user_id, v_taste, now(), v_source)
  on conflict (user_id) do update
    set taste_vector = excluded.taste_vector,
        updated_at   = excluded.updated_at,
        seeded_from  = excluded.seeded_from;
end;
$$;

-- Privileges are not inherited by create or replace on an existing function,
-- but they are reset for a newly created one. Restating them keeps this
-- migration correct if it is ever replayed against a database where the
-- function does not already exist — which is the situation every preview
-- branch is in.
revoke all on function public.refresh_user_taste(uuid) from public, anon;
grant execute on function public.refresh_user_taste(uuid) to authenticated, service_role;

comment on column public.user_taste.seeded_from is
  'Where the current vector came from: likes, interests, authored, or null when there was nothing to build one out of.';
