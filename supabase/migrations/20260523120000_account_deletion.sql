-- Account deletion RPC. Removes account records, cascaded database rows, and
-- user-owned public storage objects.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  delete from storage.objects
   where bucket_id in ('avatars', 'echo-media')
     and split_part(name, '/', 1) = v_uid::text;

  delete from public.profiles where id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.delete_account() to authenticated;
