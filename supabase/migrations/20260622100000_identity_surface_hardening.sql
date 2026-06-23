-- Identity surface hardening.
--
-- RLS protects rows, but profile rows are intentionally public. This migration
-- narrows column privileges so private operational fields cannot be read by
-- app roles, and tightens profile writes so users cannot mint trust markers or
-- pin someone else's Echo as their signature post.

-- Remove broad table-level grants first; table-level SELECT/INSERT/UPDATE
-- would otherwise include every current and future profile column.
revoke select, insert, update on public.profiles from anon, authenticated;

-- Public profile columns. Do not include push_token.
grant select (
  id,
  username,
  display_name,
  bio,
  avatar_color,
  avatar_url,
  is_verified,
  follower_count,
  created_at,
  language,
  updated_at,
  pronouns,
  mood,
  mood_expires_at,
  pinned_echo_id
) on public.profiles to anon, authenticated;

-- Client-created profile rows can only set ordinary profile fields.
grant insert (
  id,
  username,
  display_name,
  bio,
  avatar_color,
  avatar_url,
  language,
  updated_at,
  pronouns,
  mood,
  mood_expires_at,
  pinned_echo_id
) on public.profiles to authenticated;

-- Client updates are limited to editable profile fields plus the caller's own
-- push token, which remains non-readable through app roles.
grant update (
  id,
  username,
  display_name,
  bio,
  avatar_color,
  avatar_url,
  language,
  updated_at,
  pronouns,
  mood,
  mood_expires_at,
  pinned_echo_id,
  push_token
) on public.profiles to authenticated;

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and is_verified = false
    and follower_count = 0
    and push_token is null
    and (
      pinned_echo_id is null
      or exists (
        select 1
        from public.public_echoes pe
        where pe.id = pinned_echo_id
          and pe.author_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_verified is not distinct from (select is_verified from public.profiles where id = auth.uid())
    and follower_count is not distinct from (select follower_count from public.profiles where id = auth.uid())
    and (
      pinned_echo_id is null
      or exists (
        select 1
        from public.public_echoes pe
        where pe.id = pinned_echo_id
          and pe.author_id = auth.uid()
      )
    )
  );
