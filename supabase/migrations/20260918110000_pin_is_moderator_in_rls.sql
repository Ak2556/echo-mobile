-- Pin is_moderator in the profiles update policy, so the RLS layer refuses
-- self-promotion even if the column grant stops doing it.
--
-- Today the only thing preventing a user from setting their own
-- profiles.is_moderator = true is that UPDATE is granted column by column and
-- is_moderator is not on the list (20260622100000, repaired 20260705000000).
-- That works, and it is one layer deep.
--
-- One layer is thin here for two reasons. First, the repo already has a
-- documented history of missing this exact thing: 20260705000000 exists
-- because "every profiles column added after 20260622100000 shipped without a
-- grant", and its own comment sets the rule that any new client-written column
-- must add a grant. A migration that adds a grant slightly too broadly — or a
-- `grant update on public.profiles to authenticated` written out of habit —
-- silently restores table-wide write access, and nothing fails a test.
--
-- Second, the blast radius is not cosmetic. is_moderator is read server-side by
-- verify-identity's `list` and `decide` actions, which flip profiles.is_verified
-- and hand out the verified badge, and by the DSA Art. 20 appeals path. A user
-- who could set that bit could verify themselves and then any account they
-- liked, which is an impersonation primitive rather than a privilege bump.
--
-- The policy already pins is_verified and follower_count the same way. This
-- adds is_moderator to that list and changes nothing else — the text below is
-- the 20260622100000 definition with one clause added, so a client writing only
-- the columns it is granted behaves exactly as before.
--
-- profiles is deliberately not covered by guard_client_writes (20260916120000),
-- whose rule is to silently correct a server-owned column rather than reject.
-- Rejecting is right here: nothing legitimate writes this column, so a write
-- is either a bug or an attack, and both deserve a 42501 rather than a quiet
-- no-op that looks like it worked.

begin;

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_verified is not distinct from (select is_verified from public.profiles where id = auth.uid())
    and is_moderator is not distinct from (select is_moderator from public.profiles where id = auth.uid())
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

commit;
