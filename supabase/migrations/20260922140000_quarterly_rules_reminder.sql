-- Quarterly reminder of Echo's rules (IT Rules 2021, Rule 3(1)(c), as amended
-- by the IT Amendment Rules 2026, in force 20 Feb 2026).
--
-- An intermediary must inform its users at least once every three months, in
-- English or a language of their choice from the Eighth Schedule, of its rules,
-- privacy policy and user agreement, and of the consequences of not complying.
--
-- A daily job sends a 'rules_reminder' notification to every account whose
-- last reminder (or, for a new account, its creation) is 90 or more days old.
-- The notification lands in the inbox and is pushed; it opens /legal/rules,
-- which is rendered in the user's app language. rules_notices keeps the date
-- of each user's last reminder, which is also the compliance record.
--
-- The cron job is created INACTIVE. Installed builds do not know the new type
-- (they would show "interacted with you" and open nothing), so activate it
-- once a build containing app/legal/rules.tsx is live:
--   select cron.alter_job((select jobid from cron.job where jobname = 'rules-reminder'), active := true);

begin;

create table if not exists public.rules_notices (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  last_notified_at timestamptz not null
);

comment on table public.rules_notices is
  'When each user was last reminded of the rules (IT Rules 3(1)(c), every 3 months). Server-only.';

alter table public.rules_notices enable row level security;
revoke all on public.rules_notices from anon, authenticated;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'like', 'comment', 'follow', 'repost', 'mention', 'dm', 'reaction', 'bookmark', 'quote',
  'report_resolved', 'content_removed', 'appeal_resolved', 'daily_react', 'personal_nudge',
  'friend_post', 'social_task_update', 'friend_answer', 'report_urgent', 'rules_reminder'
));

create or replace function public.send_due_rules_reminders(p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent integer;
begin
  with due as (
    select p.id
      from public.profiles p
      left join public.rules_notices r on r.user_id = p.id
     where coalesce(r.last_notified_at, p.created_at) <= now() - interval '90 days'
     order by coalesce(r.last_notified_at, p.created_at)
     limit greatest(p_limit, 0)
  ),
  sent as (
    insert into public.notifications (user_id, type)
    select id, 'rules_reminder' from due
    returning user_id
  ),
  recorded as (
    insert into public.rules_notices (user_id, last_notified_at)
    select user_id, now() from sent
    on conflict (user_id) do update set last_notified_at = excluded.last_notified_at
    returning 1
  )
  select count(*) into v_sent from recorded;
  return v_sent;
end;
$$;

comment on function public.send_due_rules_reminders(integer) is
  'Notify every user not reminded of the rules in 90 days. Daily cron; batch-limited so a backlog spreads over days.';

revoke all on function public.send_due_rules_reminders(integer) from public, anon, authenticated;

-- Daily at 05:30 UTC (11:00 IST). Created inactive; see the header.
select cron.schedule('rules-reminder', '30 5 * * *', $$select public.send_due_rules_reminders();$$);
select cron.alter_job((select jobid from cron.job where jobname = 'rules-reminder'), active := false);

commit;
