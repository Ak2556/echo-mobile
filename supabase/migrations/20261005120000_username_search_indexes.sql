-- Username lookup, profile search and follows: the indexes and the one RPC that
-- keep them cheap as the user count grows. Nothing here changes what a query
-- returns; it changes what it costs, and closes one correctness gap.
--
-- 1. Case-insensitive uniqueness. profiles_username_key is UNIQUE (username), so
--    "Akash" and "akash" were two different handles; the app lowercases input
--    but nothing on the server enforced it. A unique index on lower(username)
--    makes the database the authority, and it serves every lower(username)
--    lookup, so it replaces the old non-unique profiles_username_lower_idx.
--    It fails loudly (and the whole migration with it) if a case-collision
--    already exists; there were none (50 profiles, 50 distinct lowered).
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));
drop index if exists public.profiles_username_lower_idx;

-- 2. Substring search. searchRemoteProfiles filters with ilike '%q%' on
--    username and display_name; a leading wildcard cannot use a btree, so every
--    search scanned the table (cost grows with every signup). pg_trgm GIN
--    indexes serve ilike '%q%' directly.
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username extensions.gin_trgm_ops);
create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops);

-- 3. follows_follower_idx is a prefix of the primary key (follower_id,
--    following_id), so it answers nothing the key does not, and costs a write on
--    every follow and unfollow.
drop index if exists public.follows_follower_idx;

-- 4. username_available: one index lookup, case-insensitive, excluding the
--    caller's own row so re-saving an unchanged profile never trips it.
--    SECURITY DEFINER because the question has to be answered for rows row-level
--    security hides from the caller (a private or blocking account still owns its
--    handle); it returns a boolean and nothing else, which is what the unique
--    index would reveal on a collision anyway. Signed-in callers only.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and not exists (
       select 1 from public.profiles p
        where lower(p.username) = lower(p_username)
          and p.id <> auth.uid()
     );
$$;

revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;
