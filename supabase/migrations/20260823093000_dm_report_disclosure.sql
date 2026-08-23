-- Reporting an encrypted message.
--
-- THE PROBLEM
-- Once direct messages are end-to-end encrypted, Echo cannot read them, so the
-- server-side moderation gate cannot apply to DMs. Doing nothing would mean an
-- abusive message is unactionable, and the Terms promise otherwise.
--
-- THE MECHANISM
-- Report-with-plaintext, the approach WhatsApp and Signal both use: when a
-- recipient reports a message, THEIR device — which can already read it —
-- decrypts it and attaches the plaintext to the report. Echo never gains the
-- ability to read the conversation; a participant chooses to disclose one
-- part of it.
--
-- This is a disclosure, not a decryption capability, and the distinction is
-- the whole point:
--   · only a participant can do it, because only they hold the key
--   · only the messages they select are revealed, never the thread
--   · the reporter is recorded as the discloser, because they are
--
-- WHAT A MODERATOR SEES
-- The reported message, a bounded slice of surrounding context so a joke is
-- not mistaken for a threat, and who sent what. Nothing else in the
-- conversation, and nothing at all in conversations nobody reported.

-- ── 1. dm_message becomes a reportable target ───────────────────────────────
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('echo', 'user', 'comment', 'dm_message'));

-- ── 2. the disclosed evidence ───────────────────────────────────────────────
alter table public.reports
  -- The decrypted body of the reported message, supplied by the reporter's
  -- device. Null for every non-DM report.
  add column if not exists disclosed_content text,
  -- Bounded surrounding context: [{sender_id, body, created_at}, ...].
  add column if not exists disclosed_context jsonb,
  -- Recorded separately from created_at so it is unambiguous that a human
  -- chose to disclose, and when.
  add column if not exists disclosed_at timestamptz,
  -- Ties the evidence to the message it claims to be.
  add column if not exists disclosed_message_id uuid
    references public.direct_messages(id) on delete set null;

comment on column public.reports.disclosed_content is
  'Plaintext of a reported encrypted DM, decrypted and voluntarily submitted by '
  'the reporting participant. Echo cannot obtain this any other way — it does '
  'not hold the keys. Readable only by the reporter and by moderators.';

comment on column public.reports.disclosed_context is
  'A bounded slice of surrounding messages, so a moderator can judge intent. '
  'Capped client-side and by the check constraint below.';

-- Evidence must be internally consistent: content and a timestamp travel
-- together, and only a dm_message report may carry them at all.
alter table public.reports drop constraint if exists reports_disclosure_coherent;
alter table public.reports
  add constraint reports_disclosure_coherent
  check (
    (disclosed_content is null and disclosed_at is null and disclosed_context is null)
    or (target_type = 'dm_message' and disclosed_content is not null and disclosed_at is not null)
  );

-- Keep the context slice small. A report is evidence about a message, not a
-- backdoor for exfiltrating a thread one report at a time.
alter table public.reports drop constraint if exists reports_disclosure_context_bounded;
alter table public.reports
  add constraint reports_disclosure_context_bounded
  check (
    disclosed_context is null
    or (jsonb_typeof(disclosed_context) = 'array' and jsonb_array_length(disclosed_context) <= 10)
  );

create index if not exists reports_dm_message_idx
  on public.reports (disclosed_message_id) where disclosed_message_id is not null;

-- ── 3. only a participant may disclose ──────────────────────────────────────
-- Without this, anyone could file a report attaching invented "plaintext"
-- against a message they were never able to read.
create or replace function public.validate_dm_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation uuid;
begin
  if new.target_type <> 'dm_message' then
    return new;
  end if;

  select m.conversation_id into v_conversation
    from public.direct_messages m
   where m.id = new.disclosed_message_id;

  if v_conversation is null then
    raise exception 'A DM report must reference an existing message';
  end if;

  if not exists (
    select 1
      from public.dm_conversations c
     where c.id = v_conversation
       and (c.user_a = new.reporter_id or c.user_b = new.reporter_id)
    union all
    select 1
      from public.dm_conversation_members mem
     where mem.conversation_id = v_conversation
       and mem.user_id = new.reporter_id
  ) then
    raise exception 'Only a participant in that conversation can report its messages';
  end if;

  new.disclosed_at := coalesce(new.disclosed_at, now());
  return new;
end;
$$;

drop trigger if exists trg_validate_dm_report on public.reports;
create trigger trg_validate_dm_report
  before insert on public.reports
  for each row execute function public.validate_dm_report();

-- ── 4. who can read the evidence ────────────────────────────────────────────
-- Moderators need the whole queue to act on it.
drop policy if exists "moderators read all reports" on public.reports;
create policy "moderators read all reports" on public.reports
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_moderator = true)
  );

drop policy if exists "moderators update reports" on public.reports;
create policy "moderators update reports" on public.reports
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_moderator = true)
  );

-- Evidence is immutable to the person who filed it: a reporter must not be
-- able to rewrite what they claimed after a moderator has begun reviewing.
revoke update on public.reports from authenticated;
grant update (status, reviewed_by, reviewed_at, action_taken, internal_notes)
  on public.reports to authenticated;
