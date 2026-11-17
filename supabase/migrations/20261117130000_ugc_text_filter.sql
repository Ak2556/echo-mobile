-- A text filter for what people write on Echo: comments, bios, display names and usernames.
--
-- Posts are judged by a model (embed-echo) that fails closed, and that is the right tool for a post.
-- It is the wrong one here: the model account is on a free quota of roughly 20 requests a day that
-- moderation shares with posting, so a model call per comment would use the day's quota up and, being
-- fail-closed, stop everyone posting. Comments are the highest-volume text on the app.
--
-- This is a deterministic floor, not a classifier. It stops unambiguous slurs and incitement
-- everywhere, and profanity in usernames, instantly and at no cost. It does not judge tone, context or
-- harassment that uses no listed word; reports, blocks and the post pipeline remain for that.
--
-- Policy, kept consistent with the post moderator ("ordinary opinions, profanity, politics and
-- edgy-but-legal speech are NOT violations"):
--   level 1  clear slurs, incitement to suicide or rape, child abuse material.
--            Blocked in comments, bios, display names and usernames.
--   level 2  profanity. Blocked in usernames only: a handle is shown and @-mentioned everywhere.
--
-- One source of truth: the list lives here, in the database, and the app only maps the error code to
-- text. Add or remove a term with a plain insert or delete on blocked_terms (service role); no deploy.
--
-- Two rules this must never break:
--   * handle_new_user() runs inside sign-up and says in its own comment that a raise there aborts the
--     signup (it once killed every provider). So the INSERT side of the profiles trigger never raises:
--     it swaps an offending value for a safe one, and swallows any fault of its own.
--   * Only end-user writes are checked (auth.uid() is set). The service role, which the moderation
--     pipeline and the AI tools use after their own checks, passes through.

create table if not exists public.blocked_terms (
  term  text primary key,
  mode  text     not null default 'word' check (mode in ('word', 'substring')),
  level smallint not null check (level in (1, 2)),
  kind  text     not null default 'slur' check (kind in ('slur', 'threat', 'abuse_material', 'profanity'))
);

alter table public.blocked_terms enable row level security;
revoke all on public.blocked_terms from anon, authenticated;

comment on table public.blocked_terms is
  'Terms the text filter refuses. mode=word matches a whole word or phrase; substring also matches inside run-together text and is for long, distinctive terms only (a short one would hit ordinary words). Edit with the service role.';

-- ── Normalisation ───────────────────────────────────────────────────────────────────────
-- Lower-case, strip zero-width characters, squeeze runs of 3 or more of one character (chuuutiya),
-- and turn everything that is not a letter or digit (Latin, accented Latin or Devanagari) into a
-- single space. Text is compared in three readings, because no single one is right for all of it:
--   plain     digits stay digits.
--   leet      4 reads as a, 0 as o, @ as a, $ as s ... (m@darchod). Not applied to ! or |: those
--             end sentences ("nigger!!!") and turning them into letters glued to the word hid it.
--   nodigits  digits are separators, so a handle with a number stuck on ("faggot123") still shows
--             its word.
create or replace function public.filter_normalize(t text, mode text default 'plain')
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        case when mode = 'leet'
             then translate(lower(regexp_replace(coalesce(t, ''), '[​-‍⁠﻿­]', '', 'g')),
                            '013457@$', 'oieastas')
             else lower(regexp_replace(coalesce(t, ''), '[​-‍⁠﻿­]', '', 'g'))
        end,
        '(.)\1{2,}', '\1', 'g'
      ),
      case when mode = 'nodigits'
           then '[^[:alpha:]À-ɏऀ-ॿ]+'
           else '[^[:alnum:]À-ɏऀ-ॿ]+'
      end,
      ' ', 'g'
    )
  )
$$;

-- "f.a.g.g.o.t" normalises to single-letter tokens; three or more in a row are joined back into one
-- word. Shorter runs are left alone ("a b" is just text).
create or replace function public.filter_join_spelled(norm text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  tok text;
  run text[] := '{}';
  res text[] := '{}';
begin
  foreach tok in array string_to_array(norm, ' ') loop
    if char_length(tok) = 1 then
      run := run || tok;
    else
      if cardinality(run) >= 3 then
        res := res || array_to_string(run, '');
      elsif cardinality(run) > 0 then
        res := res || run;
      end if;
      run := '{}';
      res := res || tok;
    end if;
  end loop;
  if cardinality(run) >= 3 then
    res := res || array_to_string(run, '');
  elsif cardinality(run) > 0 then
    res := res || run;
  end if;
  return array_to_string(res, ' ');
end;
$$;

-- A term added later is normalised on the way in (leet reading), so it always compares like the text
-- it is matched against; an upper-case or leet-spelt entry would otherwise never match anything.
create or replace function public.blocked_terms_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.term := public.filter_normalize(new.term, 'leet');
  if new.term = '' then
    raise exception 'blocked term is empty after normalisation';
  end if;
  return new;
end;
$$;

drop trigger if exists blocked_terms_normalize on public.blocked_terms;
create trigger blocked_terms_normalize
  before insert or update of term on public.blocked_terms
  for each row execute function public.blocked_terms_normalize();

-- ── The check ───────────────────────────────────────────────────────────────────────────
-- Does one normalised string contain a listed term at or below this level?
create or replace function public.filter_match(norm text, max_level smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Normalised terms hold only letters, digits and single spaces, so LIKE has nothing to misread.
  select exists (
    select 1
      from public.blocked_terms b
     where b.level <= max_level
       and case b.mode
             when 'word' then (' ' || norm || ' ') like '% ' || b.term || ' %'
             else replace(norm, ' ', '') like '%' || replace(b.term, ' ', '') || '%'
           end
  )
$$;

create or replace function public.text_filter_hit(p_text text, p_surface text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  max_level smallint := case p_surface when 'username' then 2 else 1 end;
  m  text;
  n  text;
  j  text;
begin
  foreach m in array array['plain', 'leet', 'nodigits'] loop
    n := public.filter_normalize(p_text, m);
    if n <> '' then
      if public.filter_match(n, max_level) then
        return true;
      end if;
      j := public.filter_join_spelled(n);
      if j <> n and public.filter_match(j, max_level) then
        return true;
      end if;
    end if;
  end loop;
  return false;
end;
$$;

-- A client that could call these could read the list out by probing it.
revoke all on function public.filter_normalize(text, text) from public, anon, authenticated;
revoke all on function public.filter_join_spelled(text) from public, anon, authenticated;
revoke all on function public.filter_match(text, smallint) from public, anon, authenticated;
revoke all on function public.text_filter_hit(text, text) from public, anon, authenticated;
revoke all on function public.blocked_terms_normalize() from public, anon, authenticated;

-- ── Enforcement ─────────────────────────────────────────────────────────────────────────
create or replace function public.guard_comment_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (tg_op = 'INSERT' or new.content is distinct from old.content)
     and public.text_filter_hit(new.content, 'comment') then
    raise exception 'text_filter:comment' using errcode = 'EC001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_comment_text() from public, anon, authenticated;

drop trigger if exists echo_comments_text_filter on public.echo_comments;
create trigger echo_comments_text_filter
  before insert or update of content on public.echo_comments
  for each row execute function public.guard_comment_text();

create or replace function public.guard_profile_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Never raises: this runs inside handle_new_user(), where a raise aborts the signup.
    begin
      if public.text_filter_hit(new.username, 'username') then
        new.username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
      end if;
      if public.text_filter_hit(new.display_name, 'display_name') then
        new.display_name := new.username;
      end if;
      if public.text_filter_hit(new.bio, 'bio') then
        new.bio := '';
      end if;
      if public.text_filter_hit(new.mood, 'bio') then
        new.mood := null;
      end if;
      if public.text_filter_hit(new.pronouns, 'bio') then
        new.pronouns := null;
      end if;
    exception when others then
      null; -- a fault in the filter must never be the reason someone cannot sign up
    end;
    return new;
  end if;

  -- An edit by a signed-in person. Only a value that CHANGED is checked, so an account that already
  -- holds an older value is not locked out of saving its other fields.
  if auth.uid() is not null then
    if new.username is distinct from old.username and public.text_filter_hit(new.username, 'username') then
      raise exception 'text_filter:username' using errcode = 'EC001';
    end if;
    if new.display_name is distinct from old.display_name and public.text_filter_hit(new.display_name, 'display_name') then
      raise exception 'text_filter:display_name' using errcode = 'EC001';
    end if;
    if new.bio is distinct from old.bio and public.text_filter_hit(new.bio, 'bio') then
      raise exception 'text_filter:bio' using errcode = 'EC001';
    end if;
    -- mood and pronouns are free text on the profile too; without them a slur would simply go there.
    if new.mood is distinct from old.mood and public.text_filter_hit(new.mood, 'bio') then
      raise exception 'text_filter:mood' using errcode = 'EC001';
    end if;
    if new.pronouns is distinct from old.pronouns and public.text_filter_hit(new.pronouns, 'bio') then
      raise exception 'text_filter:pronouns' using errcode = 'EC001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_text() from public, anon, authenticated;

drop trigger if exists profiles_text_filter_insert on public.profiles;
create trigger profiles_text_filter_insert
  before insert on public.profiles
  for each row execute function public.guard_profile_text();

drop trigger if exists profiles_text_filter_update on public.profiles;
create trigger profiles_text_filter_update
  before update of username, display_name, bio, mood, pronouns on public.profiles
  for each row execute function public.guard_profile_text();

-- A daily answer is shown to other people once the reader has answered, and it is the second most
-- written text on the app. The write is an upsert, which runs the INSERT trigger first, so one
-- trigger covers both a first answer and a replacement.
create or replace function public.guard_answer_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (tg_op = 'INSERT' or new.answer is distinct from old.answer)
     and public.text_filter_hit(new.answer, 'answer') then
    raise exception 'text_filter:answer' using errcode = 'EC001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_answer_text() from public, anon, authenticated;

drop trigger if exists daily_answers_text_filter on public.daily_answers;
create trigger daily_answers_text_filter
  before insert or update of answer on public.daily_answers
  for each row execute function public.guard_answer_text();

-- The availability check the sign-up and edit screens already call: a handle the filter refuses reads
-- as unavailable, before anyone types a whole profile. (The trigger above is the backstop for a
-- client that skips the check.)
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and not public.text_filter_hit(p_username, 'username')
     and not exists (
       select 1 from public.profiles p
        where lower(p.username) = lower(p_username)
          and p.id <> auth.uid()
     );
$$;

revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

-- ── Starting list ───────────────────────────────────────────────────────────────────────
-- A starting point, not a finished list. The Hindi and Hinglish entries and the Devanagari forms in
-- particular want review by a native speaker; extend it with plain inserts, see the table comment.
-- Short words are mode 'word' so they cannot fire inside longer ones ("snigger", "Brandi").
insert into public.blocked_terms (term, mode, level, kind) values
  -- level 1: slurs
  ('nigger',  'word', 1, 'slur'), ('niggers', 'word', 1, 'slur'),
  ('faggot',  'word', 1, 'slur'), ('faggots', 'word', 1, 'slur'),
  ('kike',    'word', 1, 'slur'), ('kikes',   'word', 1, 'slur'),
  ('spic',    'word', 1, 'slur'),
  ('chink',   'word', 1, 'slur'), ('chinks',  'word', 1, 'slur'),
  ('gook',    'word', 1, 'slur'), ('gooks',   'word', 1, 'slur'),
  ('wetback', 'word', 1, 'slur'),
  ('tranny',  'word', 1, 'slur'), ('trannies','word', 1, 'slur'),
  ('paki',    'word', 1, 'slur'), ('pakis',   'word', 1, 'slur'),
  ('katua',   'word', 1, 'slur'), ('katue',   'word', 1, 'slur'),
  ('chinki',  'word', 1, 'slur'),
  -- level 1: incitement. ("kill yourself laughing" is caught too: a known false positive of a keyword
  -- floor, accepted for a phrase this rarely innocent.) Child abuse material is deliberately NOT here:
  -- a keyword cannot tell a solicitation from a news comment about an arrest, so it would block
  -- legitimate discussion; that category is the media pipeline's and the reports' job.
  ('kill yourself',  'word', 1, 'threat'), ('kys',            'word', 1, 'threat'),
  ('hang yourself',  'word', 1, 'threat'), ('go kill yourself','word', 1, 'threat'),
  ('rape you',       'word', 1, 'threat'), ('raping you',     'word', 1, 'threat'),
  -- level 2: profanity, usernames only (English)
  ('fuck',   'word', 2, 'profanity'), ('fucker', 'word', 2, 'profanity'), ('fucking', 'word', 2, 'profanity'),
  ('motherfucker', 'word', 2, 'profanity'),
  ('shit',   'word', 2, 'profanity'), ('bitch',  'word', 2, 'profanity'), ('bastard','word', 2, 'profanity'),
  ('asshole','word', 2, 'profanity'), ('cunt',   'word', 2, 'profanity'), ('dick',   'word', 2, 'profanity'),
  ('pussy',  'word', 2, 'profanity'), ('whore',  'word', 2, 'profanity'), ('slut',   'word', 2, 'profanity'),
  ('cock',   'word', 2, 'profanity'), ('nigga',  'word', 2, 'profanity'), ('porn',   'word', 2, 'profanity'),
  ('retard', 'word', 2, 'profanity'), ('retarded','word', 2, 'profanity'),
  -- level 2: profanity, usernames only (Hindi / Hinglish, Latin script). Long distinctive ones also
  -- match run-together text; short ones are whole-word only.
  ('madarchod', 'substring', 2, 'profanity'), ('bhenchod',  'substring', 2, 'profanity'),
  ('behenchod', 'substring', 2, 'profanity'), ('bhosdike',  'substring', 2, 'profanity'),
  ('bhosdika',  'substring', 2, 'profanity'), ('chutiya',   'substring', 2, 'profanity'),
  ('gandu',     'word',      2, 'profanity'), ('gaandu',    'word',      2, 'profanity'),
  ('randi',     'word',      2, 'profanity'), ('raand',     'word',      2, 'profanity'),
  ('lund',      'word',      2, 'profanity'), ('loda',      'word',      2, 'profanity'),
  -- level 2: Devanagari
  ('मादरचोद', 'substring', 2, 'profanity'), ('बहनचोद', 'substring', 2, 'profanity'),
  ('चूतिया',   'substring', 2, 'profanity'), ('गांडू',   'word',      2, 'profanity'),
  ('रंडी',     'word',      2, 'profanity')
on conflict (term) do nothing;
