-- Pre-launch legal gaps (review of 2026-09-22).
--
-- 1. Minimum age 18. India's DPDP Act treats everyone under 18 as a child who
--    needs verifiable parental consent; Echo launches India-first and does not
--    build that flow, so it does not admit under-18s. adult_age_years() stays 18.
--
-- 2. Reports on DMs and groups. The app reports a message ('message') and a
--    group ('group'), but the check constraint allowed only echo/user/comment,
--    so both failed with a raw constraint error in front of the user.
--
-- 3. Urgent reports hide the post at once. The IT Amendment Rules 2026 (in
--    force 20 Feb 2026) require acting on complaints about nudity, sexual acts,
--    impersonation or morphed images within 2 hours (Rule 3(2)(b)). A solo
--    operator cannot promise that around the clock, so the report itself hides
--    the echo pending review and alerts every moderator. Dismissing the report
--    restores it. Reports are already rate-limited per reporter per day.
--
-- 4. Removed content stays removed. A moderator removal only sets
--    check_content = false, and the resweep / embed-echo path sets it back to
--    true when the automated classifier passes the post, so a removed echo
--    could reappear. A hold now blocks any flip back to visible while an
--    unoverturned removal decision or an open urgent report exists.

begin;

-- ── 1. minimum age ──────────────────────────────────────────────────────────
create or replace function public.minimum_age_years()
returns integer language sql immutable set search_path = public as $$ select 18 $$;

-- ── 2. report targets ───────────────────────────────────────────────────────
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('echo', 'user', 'comment', 'message', 'group'));

alter table public.reports add column if not exists auto_hidden boolean not null default false;

comment on column public.reports.auto_hidden is
  'True when this report hid its target echo on arrival (urgent reason). Dismissing the report restores the echo.';

-- ── 3. urgent reasons ───────────────────────────────────────────────────────
-- Must match URGENT_REPORT_REASONS in app/report.tsx.
create or replace function public.report_reason_is_urgent(p_reason text)
returns boolean language sql immutable set search_path = public as $$
  select p_reason in (
    'Sexual content or nudity',
    'Intimate images of me shared without consent',
    'Child sexual abuse or exploitation',
    'Impersonation'
  );
$$;

-- ── 4. the hold ─────────────────────────────────────────────────────────────
create or replace function public.echo_is_held(p_echo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.moderation_decisions md
            where md.echo_id = p_echo_id
              and md.decision_type in ('content_removed', 'content_restricted')
              and not exists (
                select 1 from public.appeals a
                 where a.decision_id = md.id and a.status = 'overturned'
              )
         )
      or exists (
           select 1 from public.reports r
            where r.target_type = 'echo'
              and r.target_id = p_echo_id
              and r.auto_hidden
              and r.status in ('open', 'reviewing')
         );
$$;

revoke all on function public.echo_is_held(uuid) from public, anon, authenticated;

create or replace function public.hold_moderated_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.check_content is true
     and old.check_content is distinct from true
     and public.echo_is_held(new.id) then
    new.check_content := false;
  end if;
  return new;
end;
$$;

-- Named to run after a_guard_client_writes and b_guard_media_provenance.
drop trigger if exists c_hold_moderated_content on public.public_echoes;
create trigger c_hold_moderated_content
  before update of check_content on public.public_echoes
  for each row execute function public.hold_moderated_content();

-- ── 5. act on an urgent report ──────────────────────────────────────────────
create or replace function public.act_on_urgent_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hidden boolean := false;
begin
  -- Server-owned: a client inserting auto_hidden = true would otherwise put a
  -- hold on any echo without hiding it through this path.
  new.auto_hidden := false;
  if not public.report_reason_is_urgent(new.reason) then
    return new;
  end if;

  if new.target_type = 'echo' then
    update public.public_echoes
       set check_content = false
     where id = new.target_id
       and check_content is true;
    v_hidden := found;
  end if;
  new.auto_hidden := v_hidden;

  -- Every moderator hears about it; 'report_urgent' bypasses the daily push cap.
  -- Only the alert is guarded: a failed alert must never lose the report or
  -- undo the hide above.
  begin
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
    select p.id, 'report_urgent', null, new.target_type, new.target_id,
           left(new.reason, 120) || case when v_hidden then ' · hidden pending review' else '' end
      from public.profiles p
     where p.is_moderator;
  exception when others then
    raise warning 'act_on_urgent_report alert failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_act_on_urgent_report on public.reports;
create trigger trg_act_on_urgent_report
  before insert on public.reports
  for each row execute function public.act_on_urgent_report();

create or replace function public.restore_on_dismissed_urgent_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.auto_hidden and new.status = 'dismissed' and old.status is distinct from 'dismissed'
     and new.target_type = 'echo' then
    -- The hold trigger still applies: another open urgent report or a removal
    -- decision keeps the echo hidden.
    update public.public_echoes set check_content = true where id = new.target_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restore_on_dismissed_urgent_report on public.reports;
create trigger trg_restore_on_dismissed_urgent_report
  after update of status on public.reports
  for each row execute function public.restore_on_dismissed_urgent_report();

-- ── 6. the alert type ───────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'like', 'comment', 'follow', 'repost', 'mention', 'dm', 'reaction', 'bookmark', 'quote',
  'report_resolved', 'content_removed', 'appeal_resolved', 'daily_react', 'personal_nudge',
  'friend_post', 'social_task_update', 'friend_answer', 'report_urgent'
));

revoke all on function public.act_on_urgent_report() from public, anon, authenticated;
revoke all on function public.restore_on_dismissed_urgent_report() from public, anon, authenticated;
revoke all on function public.hold_moderated_content() from public, anon, authenticated;

commit;
