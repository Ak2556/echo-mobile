-- Personalization, from the interests people already picked.
--
-- Two gaps found on 2026-09-23:
--
--   1. The interests chosen in the signup wizard never left the device. They
--      were written to the Zustand store and nowhere else, so nothing on the
--      server could rank by them.
--
--   2. refresh_user_taste() averages the embeddings of a user's last twenty
--      liked posts. Someone who has not liked anything yet gets a null taste
--      vector, which makes the semantic candidate source return nothing — so
--      a brand new account sees the same feed as a signed-out visitor, even
--      after it becomes eligible for personalization.
--
-- user_interests stores the choice, and the taste refresh falls back to it:
-- with no likes on file, the centroid is the average of the interest labels
-- themselves, embedded once each by the embed-interests function with the same
-- model that embeds posts, so they live in the same space.
--
-- The first version of this matched interest words against post text. Measured
-- against the real corpus, every interest matched zero posts — 83 short posts
-- rarely contain the word "philosophy" even when that is what they are about.
-- Keyword matching was the wrong mechanism, so it is gone.
--
-- Interests are private. They sit in their own table rather than a profiles
-- column because profiles rows are broadly readable, and what someone is
-- interested in is nobody else's business.

begin;

create table if not exists public.user_interests (
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  interest   text        not null check (length(interest) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (user_id, interest)
);

comment on table public.user_interests is
  'Interests a person chose for themselves. Private to them, and the seed for their taste vector before they have liked anything.';

alter table public.user_interests enable row level security;

drop policy if exists user_interests_select_own on public.user_interests;
create policy user_interests_select_own on public.user_interests
  for select using (user_id = auth.uid());

drop policy if exists user_interests_insert_own on public.user_interests;
create policy user_interests_insert_own on public.user_interests
  for insert with check (user_id = auth.uid());

drop policy if exists user_interests_delete_own on public.user_interests;
create policy user_interests_delete_own on public.user_interests
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.user_interests to authenticated;


-- ── the interest labels, in the same vector space as the posts ──────────────
create table if not exists public.interest_embeddings (
  interest   text        primary key,
  embedding  extensions.vector(768) not null,
  updated_at timestamptz not null default now()
);

comment on table public.interest_embeddings is
  'One vector per interest label, written by the embed-interests function with the same model that embeds posts. Read only by refresh_user_taste.';

alter table public.interest_embeddings enable row level security;
revoke all on public.interest_embeddings from anon, authenticated;

-- ── taste: likes first, then the stated interests ───────────────────────────
alter table public.user_taste add column if not exists seeded_from text;

comment on column public.user_taste.seeded_from is
  'Where the current vector came from: likes, interests, or null when there was nothing to build one out of.';

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

    if v_taste is not null then v_source := 'interests'; end if;
  end if;

  insert into public.user_taste (user_id, taste_vector, updated_at, seeded_from)
  values (p_user_id, v_taste, now(), v_source)
  on conflict (user_id) do update
    set taste_vector = excluded.taste_vector,
        updated_at   = excluded.updated_at,
        seeded_from  = excluded.seeded_from;
end;
$$;


commit;
