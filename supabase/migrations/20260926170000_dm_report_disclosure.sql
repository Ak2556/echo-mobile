-- Reporting an end-to-end encrypted DM.
--
-- Echo cannot read a sealed message, but the Terms promise moderation. A
-- participant who reports one has their device disclose, and only then: the
-- reported message, up to 5 messages before it, and that one message's key.
-- The key lets a moderator check the disclosed text against the stored
-- ciphertext (lib/e2ee/crypto.ts verifyDisclosure), so a reporter cannot frame
-- someone with invented text. The surrounding context is NOT verifiable and
-- must be read as the reporter's account.
--
-- Design salvaged from origin/feat/e2ee 795cc78, adapted to the live
-- target types ('message', not 'dm_message').
--
-- Sorts after 20260926155000, which narrowed authenticated's INSERT on
-- reports to the five columns the app writes. The disclosed_* grant below is
-- additive to that; disclosed_at stays server-owned (set by the trigger).

alter table public.reports
  add column disclosed_content text check (disclosed_content is null or length(disclosed_content) <= 20000),
  add column disclosed_context jsonb,
  add column disclosed_message_key text,
  add column disclosed_at timestamptz;

alter table public.reports
  add constraint reports_disclosure_coherent check (
    (disclosed_content is null and disclosed_context is null and disclosed_message_key is null and disclosed_at is null)
    or (target_type = 'message' and disclosed_content is not null and disclosed_at is not null)
  ),
  add constraint reports_disclosure_context_bounded check (
    disclosed_context is null
    or (jsonb_typeof(disclosed_context) = 'array' and jsonb_array_length(disclosed_context) <= 10)
  ),
  add constraint reports_disclosure_key_shape check (
    disclosed_message_key is null or disclosed_message_key ~ '^[0-9a-f]{64}$'
  );

grant insert (disclosed_content, disclosed_context, disclosed_message_key) on public.reports to authenticated;
grant select (disclosed_content, disclosed_context, disclosed_message_key, disclosed_at) on public.reports to authenticated;

create or replace function public.validate_message_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation uuid;
begin
  if new.target_type <> 'message' or new.disclosed_content is null then
    new.disclosed_at := null;
    return new;
  end if;
  select m.conversation_id into v_conversation
    from public.direct_messages m
   where m.id = new.target_id;
  if v_conversation is null then
    raise exception 'A message report must reference an existing message' using errcode = '23503';
  end if;
  if not public.is_dm_conversation_member(v_conversation, new.reporter_id) then
    raise exception 'Only a participant in that conversation can report its messages' using errcode = '42501';
  end if;
  new.disclosed_at := now();
  return new;
end;
$$;
revoke all on function public.validate_message_report() from public, anon, authenticated;

create trigger b_validate_message_report
  before insert on public.reports
  for each row execute function public.validate_message_report();
