-- One push token per device, instead of one per account.
--
-- Until now the only place a token lived was `profiles.push_token`, a single
-- text column. Three consequences, all silent:
--
--   * Signing in on a second device overwrote the first device's token, so the
--     first device simply stopped receiving notifications. Nothing surfaced it.
--   * Signing out anywhere set the column to null, killing push on every device
--     the account had.
--   * A token that Expo has since rejected (app uninstalled, token rotated) sat
--     in the column forever, because nothing ever read the send response.
--
-- A token is a property of a device, not of an account, so it is the primary
-- key here. When a phone is handed to another person and they sign in, the
-- upsert moves the row to the new user_id — which is exactly right, and is the
-- one case a (user_id, token) key would get wrong by leaving the previous
-- owner subscribed to a device they no longer hold.

create table if not exists public.push_tokens (
  token         text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  platform      text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

-- Owners manage their own rows; push-fanout reads them as service_role, which
-- bypasses RLS. No policy grants anyone read access to another user's tokens —
-- a push token is a delivery capability, and leaking one lets a third party
-- address that device through Expo.
drop policy if exists "own push tokens select" on public.push_tokens;
create policy "own push tokens select" on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own push tokens insert" on public.push_tokens;
create policy "own push tokens insert" on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own push tokens update" on public.push_tokens;
create policy "own push tokens update" on public.push_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own push tokens delete" on public.push_tokens;
create policy "own push tokens delete" on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.push_tokens to authenticated;

-- Carry over the tokens already on file so nobody loses notifications at the
-- moment this ships. `profiles.push_token` keeps being written by the client
-- for now: installs running older JS still read and write only that column, and
-- push-fanout falls back to it when a user has no rows here yet.
insert into public.push_tokens (token, user_id, platform)
select p.push_token, p.id, null
from public.profiles p
where p.push_token is not null and p.push_token <> ''
on conflict (token) do nothing;
