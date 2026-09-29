-- A reaction may only be added by a member of the message's conversation.
--
-- react_insert checked nothing but user_id = auth.uid(), so anyone who knew a
-- message's id could attach a reaction to someone else's DM, and react_select
-- then showed it to the conversation's members. Since 20260929110000 each
-- reaction also bumps its message over realtime, which would make such an
-- injected reaction appear live.
--
-- The check mirrors react_select: the message exists and the caller is a
-- member of its conversation (is_dm_conversation_member covers 1:1 and
-- groups). As of 2026-09-29 production held 7 reactions, none by a
-- non-member, so no existing row is affected (WITH CHECK applies to new rows
-- only in any case).
--
-- The policy is also narrowed from PUBLIC to authenticated. anon could never
-- pass it (auth.uid() is null), so this changes nothing for any real caller.

drop policy if exists react_insert on public.message_reactions;

create policy react_insert on public.message_reactions
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.direct_messages dm
       where dm.id = message_reactions.message_id
         and public.is_dm_conversation_member(dm.conversation_id, (select auth.uid()))
    )
  );
