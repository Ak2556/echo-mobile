-- Fix: notify_on_comment() referenced new.user_id, but public.echo_comments
-- has no user_id column — its commenter column is author_id (see base_schema).
-- Every INSERT into echo_comments fires the on_comment_notify trigger, which
-- raised: record "new" has no field "user_id". This blocked ALL commenting
-- (real in-app comments and the content seed alike).
--
-- Only the two new.user_id references change to new.author_id; the body is
-- otherwise identical to the original definition. The existing on_comment_notify
-- trigger picks up the replaced function automatically — no trigger change needed.

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
