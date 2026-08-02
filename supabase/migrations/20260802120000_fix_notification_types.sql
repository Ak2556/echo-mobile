-- Fix: notifications_type_check has been silently dropping notification types.
--
-- History: 20260522120000 added reaction/bookmark/quote; 20260622200000 and the
-- July fan-out migrations each REDEFINED the whole constraint from a partial
-- list, dropping reaction/bookmark/quote (and appeal_resolved). schema_health_fix
-- restored them once (June 25) but July re-broke it; the Art.20 migration only
-- restored appeal_resolved. Result live in prod: notify_on_echo_reaction/
-- bookmark/quote insert types the constraint rejects — and because those triggers
-- swallow errors (`exception when others`), the notifications are silently lost.
-- So authors currently get NO reaction / bookmark / quote notifications.
--
-- Set the constraint to the COMPLETE set every trigger + the client type union
-- (types/index.ts) actually use, so a future partial redefinition is the only way
-- to regress again.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'follow', 'repost', 'mention', 'dm',
    'reaction', 'bookmark', 'quote',
    'report_resolved', 'content_removed', 'appeal_resolved',
    'daily_react', 'personal_nudge'
  ));
