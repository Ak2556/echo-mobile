-- Narrow client write grants on direct_messages and reports (audit of 2026-09-26).
--
-- Neither table has ever had an explicit grant, so both carry Supabase's
-- default GRANT ALL to anon and authenticated. RLS decides which rows a client
-- may write, but not which columns, and on these two tables that gap was live:
--
-- 1. direct_messages: dm_update_self checks only auth.uid() = sender_id, with
--    no membership check on the new row. A sender could
--      update direct_messages set conversation_id = '<any conversation>'
--       where id = '<own message>'
--    and the message would appear in a conversation they are not in, because
--    dm_select_participants lets its members read it. sender_id, kind, id and
--    created_at were rewritable the same way.
--
--    The app updates exactly three columns: text + edited_at
--    (editRemoteMessage) and deleted_at (deleteRemoteMessage). read_at is set
--    only by mark_messages_read, which is SECURITY DEFINER and needs no grant.
--
-- 2. reports: the insert policy checks only auth.uid() = reporter_id, so a
--    reporter could file a report that arrives already 'resolved', with
--    invented internal_notes, action_taken and a reviewed_by pointing at a
--    real moderator. That fakes a moderation record, and a pre-resolved report
--    never enters the review queue.
--
--    The app inserts exactly five columns (submitRemoteReport). id, status and
--    created_at take their defaults. act_on_urgent_report and the report_day
--    rate limit read only reason, target_type, target_id and reporter_id, and
--    act_on_urgent_report already overwrites auto_hidden; a BEFORE trigger's
--    writes to NEW are not subject to column privileges, so it keeps working.
--
-- 3. anon: every policy on both tables is TO public and keyed on auth.uid(),
--    which is null for anon, so anon can never match a row. Its grants serve
--    nothing and are removed.
--
-- Revoking a table privilege also revokes that privilege on each column, so
-- the revoke/grant pairs below leave exactly the listed columns. Columns added
-- later are granted by the migration that adds them. The DM E2EE work
-- (20260926160000, 20260926170000) grants UPDATE (ciphertext, nonce) and
-- INSERT (disclosed_*) itself. This file sorts before both. If it is ever
-- applied after them, the guarded block at the end restores exactly those
-- grants, so the revokes here cannot silently break sealed edits or reports.
--
-- lib/securityHardening.test.ts pins both grants.

begin;

revoke all on public.direct_messages from anon;
revoke update on public.direct_messages from authenticated;
grant update (text, edited_at, deleted_at) on public.direct_messages to authenticated;

revoke all on public.reports from anon;
revoke insert on public.reports from authenticated;
grant insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;

-- No-op today: these columns do not exist yet.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'direct_messages' and column_name = 'ciphertext') then
    grant update (ciphertext, nonce) on public.direct_messages to authenticated;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'reports' and column_name = 'disclosed_content') then
    grant insert (disclosed_content, disclosed_context, disclosed_message_key) on public.reports to authenticated;
  end if;
end;
$$;

commit;
