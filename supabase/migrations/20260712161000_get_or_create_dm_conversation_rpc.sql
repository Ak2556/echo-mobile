-- Server-side one-on-one conversation creation.
-- Client-side upserts can be rejected by RLS/update paths after group chat
-- schema changes. This RPC validates the signed-in user, keeps the pair
-- canonical, and returns the existing or newly created conversation id.

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

  insert into public.dm_conversations (user_a, user_b, is_group)
  values (v_user_a, v_user_b, false)
  on conflict (user_a, user_b) do update
    set is_group = false
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

grant execute on function public.get_or_create_dm_conversation(uuid) to authenticated;
