-- Account deletion RPC.
--
-- Apple App Store guideline 5.1.1(v) requires that any app offering account
-- creation must also offer in-app account deletion. This RPC tears down the
-- caller's profile + all FK-cascaded rows (echoes, comments, reactions,
-- follows, notifications, etc. — see base_schema.sql ON DELETE CASCADE
-- chains). After the row is gone, the Supabase auth user is also wiped so
-- the email/phone is released and no session can be refreshed.
--
-- Idempotent: re-running on a missing profile is a no-op so a retry from a
-- transient network error won't fail.

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

  -- Profile row cascades to all owned content via existing FKs.
  delete from public.profiles where id = v_uid;

  -- Best-effort: remove the auth user row so the email/phone can be re-used
  -- and any active sessions are invalidated. This uses the auth.users
  -- privileged table — only safe in a security-definer function.
  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.delete_account() to authenticated;
