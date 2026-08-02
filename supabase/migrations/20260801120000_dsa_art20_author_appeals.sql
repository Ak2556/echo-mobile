-- DSA Art. 17 (statement of reasons) + Art. 20 (internal appeals) — the author
-- side. The existing appeals flow only let REPORTERS appeal dismissed reports.
-- Art. 20's core case — the user whose own content was removed appealing that
-- decision — was missing, along with any persistent record of the decision.
--
-- This migration adds:
--   1. A regression fix: restore 'appeal_resolved' to notifications_type_check
--      (dropped by the July fan-out migrations, which silently broke appeal
--      resolution — the trigger insert violated the check constraint).
--   2. moderation_decisions: the persistent statement of reasons + the
--      appealable object, with a 6-month appeal window (Art. 20(1)).
--   3. moderator_remove_echo(): a moderator-gated action that HIDES an echo
--      (reversible, via check_content=false), records the decision, and
--      notifies the author (Art. 17).
--   4. appeals extended so the subject can appeal a decision within the window;
--      an upheld appeal restores the content.

-- ── 1. Regression fix: notifications type check (add appeal_resolved + moderation_decision route type) ──
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'follow', 'repost', 'mention', 'dm',
    'report_resolved', 'content_removed', 'daily_react', 'personal_nudge',
    'appeal_resolved'   -- restored: dropped by July fan-out migrations
  ));

-- ── 2. moderation_decisions: statement of reasons + appealable object ──
create table if not exists public.moderation_decisions (
  id             uuid        primary key default gen_random_uuid(),
  subject_id     uuid        not null references public.profiles(id) on delete cascade,
  echo_id        uuid        references public.public_echoes(id) on delete set null,
  decision_type  text        not null
                             check (decision_type in ('content_removed', 'content_restricted', 'account_suspended')),
  ground         text        not null,   -- legal / ToS basis for the decision
  reason         text        not null,   -- human-readable statement of reasons
  automated      boolean     not null default false,
  created_at     timestamptz not null default now(),
  -- Art. 20(1): appeals available for at least six months after the decision.
  appeal_deadline timestamptz not null default (now() + interval '6 months')
);

alter table public.moderation_decisions enable row level security;

drop policy if exists "subject reads own decisions" on public.moderation_decisions;
create policy "subject reads own decisions"
  on public.moderation_decisions for select
  using (auth.uid() = subject_id);

drop policy if exists "moderators read all decisions" on public.moderation_decisions;
create policy "moderators read all decisions"
  on public.moderation_decisions for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_moderator = true));

-- No user/mod INSERT policy: decisions are written only by the SECURITY DEFINER
-- moderator functions below (and service role).

create index if not exists moderation_decisions_subject_idx on public.moderation_decisions (subject_id);
create index if not exists moderation_decisions_echo_idx    on public.moderation_decisions (echo_id);

-- ── 3. Moderator action: hide an echo + record the decision + notify author ──
create or replace function public.moderator_remove_echo(
  p_echo_id uuid,
  p_ground  text,
  p_reason  text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author   uuid;
  v_decision uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_moderator = true) then
    raise exception 'not_a_moderator' using errcode = '42501';
  end if;
  if p_ground is null or length(trim(p_ground)) = 0 then
    raise exception 'ground_required' using errcode = 'P0001';
  end if;

  select author_id into v_author from public.public_echoes where id = p_echo_id;
  if v_author is null then
    raise exception 'echo_not_found' using errcode = 'P0001';
  end if;

  -- Reversible hide: the feed/thread queries gate on check_content = true.
  update public.public_echoes set check_content = false where id = p_echo_id;

  insert into public.moderation_decisions (subject_id, echo_id, decision_type, ground, reason, automated)
  values (v_author, p_echo_id, 'content_removed', p_ground, coalesce(nullif(trim(p_reason), ''), p_ground), false)
  returning id into v_decision;

  -- Art. 17: inform the author, with a link to the decision (and thus to appeal).
  insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
  values (
    v_author, 'content_removed', null, 'moderation_decision', v_decision,
    'Your content was removed. Tap to see the reasons and appeal.'
  );

  return v_decision;
end;
$$;

revoke all on function public.moderator_remove_echo(uuid, text, text) from public;
grant execute on function public.moderator_remove_echo(uuid, text, text) to authenticated;

-- ── 4. Extend appeals so the subject can appeal a decision (not just a report) ──
alter table public.appeals alter column report_id drop not null;
alter table public.appeals add column if not exists decision_id uuid
  references public.moderation_decisions(id) on delete cascade;

-- Exactly one target: a report (reporter appeal) OR a decision (author appeal).
alter table public.appeals drop constraint if exists appeal_target_exactly_one;
alter table public.appeals add constraint appeal_target_exactly_one check (
  (report_id is not null and decision_id is null) or
  (report_id is null and decision_id is not null)
);

-- One decision-appeal per subject (the report path keeps its own unique).
create unique index if not exists appeals_decision_appellant_uq
  on public.appeals (decision_id, appellant_id) where decision_id is not null;
create index if not exists appeals_decision_idx on public.appeals (decision_id);

-- The subject of a decision can appeal it, within the 6-month window.
drop policy if exists "subjects appeal own decision" on public.appeals;
create policy "subjects appeal own decision"
  on public.appeals for insert
  with check (
    auth.uid() = appellant_id
    and decision_id is not null
    and exists (
      select 1 from public.moderation_decisions md
      where md.id = decision_id
        and md.subject_id = auth.uid()
        and now() < md.appeal_deadline
    )
  );

-- ── 5. An OVERTURNED appeal restores the hidden content ──
-- Codebase semantics (mod-appeals.tsx descriptions + appeal.tsx STATUS_CONFIG)
-- are decision-centric: status 'overturned' = the moderation decision is
-- overturned -> content restored; 'upheld' = decision stands -> content stays
-- removed. So the restore fires on 'overturned', not 'upheld'.
create or replace function public.restore_content_on_overturned_appeal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'overturned' and old.status = 'pending' and new.decision_id is not null then
    update public.public_echoes pe
      set check_content = true
      from public.moderation_decisions md
     where md.id = new.decision_id
       and pe.id = md.echo_id
       and md.decision_type = 'content_removed';
  end if;
  return new;
end;
$$;

drop trigger if exists appeals_upheld_restore on public.appeals;
drop trigger if exists appeals_overturned_restore on public.appeals;
create trigger appeals_overturned_restore
  after update on public.appeals
  for each row execute function public.restore_content_on_overturned_appeal();
