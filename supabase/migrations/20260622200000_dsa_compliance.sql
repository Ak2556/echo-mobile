-- DSA Art. 16 compliance: notify reporters of report outcomes.
-- When a moderator resolves or dismisses a report, the reporter receives
-- an in-app notification so they are informed of the outcome.

-- 1. Expand notification type to include report outcomes and content moderation.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'follow', 'repost', 'mention', 'dm',
    'report_resolved',   -- DSA Art. 16: reporter notified of outcome
    'content_removed'    -- DSA Art. 17: author notified of content removal
  ));

-- 2. Allow system-generated notifications without a human actor.
alter table public.notifications
  alter column actor_id drop not null;

-- 3. Trigger: notify reporter when their report is resolved or dismissed.
create or replace function public.notify_reporter_on_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('resolved', 'dismissed')
     and old.status not in ('resolved', 'dismissed')
  then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
    values (
      new.reporter_id,
      'report_resolved',
      null,
      'report',
      new.id,
      case new.status
        when 'resolved'  then 'Your report has been reviewed — action was taken.'
        when 'dismissed' then 'Your report was reviewed. No action was required.'
      end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_report_resolution_notification on public.reports;
create trigger trg_report_resolution_notification
  after update of status on public.reports
  for each row
  execute function public.notify_reporter_on_resolution();

-- 4. Grant reporters UPDATE right on their own reports is not needed;
--    the trigger runs as SECURITY DEFINER with service-role context.
--    Moderation actions go through a service-role admin function or
--    the Supabase dashboard — not through the app client.
