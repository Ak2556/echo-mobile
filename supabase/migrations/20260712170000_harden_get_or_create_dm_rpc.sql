-- Harden one-on-one DM lookup/creation.
-- Avoid conflict updates on existing conversations and force PostgREST schema
-- reload so newly published clients can call the RPC immediately.

create or replace function public.get_or_create_dm_conversation(p_recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_conversation_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  if p_recipient_id is null or p_recipient_id = v_uid then
    raise exception 'invalid recipient';
  end if;

  if v_uid < p_recipient_id then
    v_user_a := v_uid;
    v_user_b := p_recipient_id;
  else
    v_user_a := p_recipient_id;
    v_user_b := v_uid;
  end if;

  select id
    into v_conversation_id
    from public.dm_conversations
   where coalesce(is_group, false) = false
     and user_a = v_user_a
     and user_b = v_user_b
   limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.dm_conversations (user_a, user_b, is_group)
  values (v_user_a, v_user_b, false)
  on conflict (user_a, user_b) do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select id
      into v_conversation_id
      from public.dm_conversations
     where coalesce(is_group, false) = false
       and user_a = v_user_a
       and user_b = v_user_b
     limit 1;
  end if;

  if v_conversation_id is null then
    raise exception 'could not create conversation';
  end if;

  return v_conversation_id;
end;
$$;

grant execute on function public.get_or_create_dm_conversation(uuid) to authenticated;

notify pgrst, 'reload schema';
