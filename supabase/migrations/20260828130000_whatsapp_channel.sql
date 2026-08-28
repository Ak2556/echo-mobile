-- Reaching Echo without opening Echo.
--
-- The point of a messaging channel is that there is no app to open: you text a
-- number the way you text a person. For India that number is on WhatsApp, not
-- iMessage — which is the whole reason this is worth building rather than
-- copying.
--
-- Two tables, because there are two ways a WhatsApp number becomes an Echo
-- account:
--
--   phone match  the number already verified itself through phone OTP, so
--                auth.users.phone is authoritative and the link is automatic.
--   code         everyone else. The app shows a short code, the user sends it
--                to the number, and that proves they hold the handset.
--
-- Both are recorded, because "how did this link happen" is the first question
-- worth asking if a link is ever disputed.

create table if not exists public.whatsapp_links (
  -- Meta's wa_id: digits only, no plus. Stored exactly as WhatsApp sends it so
  -- an inbound message is a primary-key lookup and nothing has to be guessed.
  wa_id           text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  linked_via      text not null check (linked_via in ('phone_match', 'code')),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz
);

create index if not exists idx_whatsapp_links_user on public.whatsapp_links(user_id);

-- Short-lived proof that the person holding the handset is the person holding
-- the account.
create table if not exists public.whatsapp_link_codes (
  code       text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_link_codes_user on public.whatsapp_link_codes(user_id);

alter table public.whatsapp_links      enable row level security;
alter table public.whatsapp_link_codes enable row level security;

-- Users see and remove their own link; nothing else is readable. A wa_id is a
-- phone number, and the mapping from number to account is exactly the kind of
-- thing that should never be enumerable.
drop policy if exists "own whatsapp link" on public.whatsapp_links;
create policy "own whatsapp link" on public.whatsapp_links
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "unlink own whatsapp" on public.whatsapp_links;
create policy "unlink own whatsapp" on public.whatsapp_links
  for delete to authenticated using (user_id = auth.uid());

-- Codes are created by the client and consumed by the webhook under service
-- role. A user may only ever see their own.
drop policy if exists "own link codes" on public.whatsapp_link_codes;
create policy "own link codes" on public.whatsapp_link_codes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, delete on public.whatsapp_links to authenticated;
grant select, insert, delete on public.whatsapp_link_codes to authenticated;

-- Inbound writes happen in the webhook as service_role, which bypasses RLS.
