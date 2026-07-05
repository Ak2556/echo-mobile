-- delete_account was broken in production: Supabase now blocks direct DML on
-- storage tables ("Direct deletion from storage tables is not allowed. Use
-- the Storage API instead"), and the storage cleanup ran FIRST — so the
-- function threw before deleting anything and no user could delete their
-- account (an App Store review requirement).
--
-- Fix: delete the account rows first (profiles cascades through app tables,
-- then auth.users), and attempt storage cleanup last inside an exception
-- guard so a storage-layer refusal can never block the deletion itself.
-- Bucket list extended to the buckets added since the original migration.

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

  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;

  -- Best-effort object cleanup. Direct storage DML is disallowed on current
  -- Supabase; if that ever changes this reclaims the files, and until then
  -- the exception guard keeps deletion working. Orphaned objects are keyed
  -- by the deleted uid and unreachable through the app.
  begin
    delete from storage.objects
     where bucket_id in ('avatars', 'echo-media', 'dm-media', 'marketplace-photos')
       and split_part(name, '/', 1) = v_uid::text;
  exception when others then
    null;
  end;
end;
$$;

grant execute on function public.delete_account() to authenticated;
