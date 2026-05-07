-- Fix notify_on_comment: echo_comments uses author_id, not user_id
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id
    from public.public_echoes where id = new.echo_id;

  if v_author_id is not null and v_author_id <> new.author_id then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
    values (v_author_id, 'comment', new.author_id, 'echo', new.echo_id,
            left(new.content, 120))
    on conflict do nothing;
  end if;
  return new;
end;
$$;
