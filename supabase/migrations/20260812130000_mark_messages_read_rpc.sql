create or replace function public.mark_messages_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.direct_messages
     set read_at = now()
   where conversation_id = p_conversation_id
     and sender_id != auth.uid()
     and read_at is null;
$$;

grant execute on function public.mark_messages_read(uuid) to authenticated;
