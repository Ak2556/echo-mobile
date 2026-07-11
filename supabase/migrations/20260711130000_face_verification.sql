-- Face verification → verified badge.
--
-- Flow: user submits a pose-challenge selfie into the private `verification`
-- bucket → the verify-identity edge function has Gemini compare it with the
-- profile photo (liveness + same-person + pose) → clear verdicts auto-decide,
-- ambiguous ones stay pending for a moderator. profiles.is_verified is only
-- ever written by the edge function (service role); clients cannot grant
-- themselves the badge. Selfies are deleted as soon as a decision lands.

create table if not exists public.verification_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  selfie_path   text not null,
  pose          text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  ai_verdict    jsonb,
  reject_reason text,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

create unique index if not exists one_pending_verification_per_user
  on public.verification_requests (user_id) where (status = 'pending');

alter table public.verification_requests enable row level security;

-- Owners see their own requests. Inserts/updates go through the edge function
-- (service role), so clients get no insert/update policies at all.
create policy "own verification requests — select"
  on public.verification_requests for select
  using (auth.uid() = user_id);

-- Moderators see the whole queue (decisions still go through the function).
create policy "moderators read verification queue"
  on public.verification_requests for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_moderator = true));

grant select on public.verification_requests to authenticated;

-- Private selfie bucket. Uploads are owner-scoped; reads are owner or
-- moderator (moderator display URLs are minted by the edge function anyway).
insert into storage.buckets (id, name, public)
values ('verification', 'verification', false)
on conflict (id) do nothing;

create policy "verification selfie upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'verification' and name like auth.uid() || '/%');

create policy "verification selfie read own or moderator"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'verification'
    and (
      name like auth.uid() || '/%'
      or exists (select 1 from public.profiles where id = auth.uid() and is_moderator = true)
    )
  );

-- Account deletion: include pending verification selfies in the best-effort
-- storage cleanup (decided selfies are already deleted by verify-identity).
-- Identical to 20260705020000_fix_delete_account.sql apart from the added
-- 'verification' bucket.
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
     where bucket_id in ('avatars', 'echo-media', 'dm-media', 'marketplace-photos', 'verification')
       and split_part(name, '/', 1) = v_uid::text;
  exception when others then
    null;
  end;
end;
$$;

grant execute on function public.delete_account() to authenticated;
