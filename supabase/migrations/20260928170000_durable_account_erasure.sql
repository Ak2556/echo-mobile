-- Account erasure that survives a failed step.
--
-- delete-account purged R2 and then called delete_account() in one request. A
-- failure after the purge left the files gone and the account in place, with
-- "contact support" as the only way forward, and delete_account()'s attempt to
-- remove Supabase Storage objects is disallowed on Supabase and was swallowed,
-- so legacy DM media and selfies outlived every deleted account.
--
-- request_erasure records the request and queues an 'erasure' job in one
-- transaction. The edge function then runs the steps (R2, Storage API, rows);
-- if one fails, the worker resumes from the step recorded here.
--
-- erasure_requests has no foreign key to auth.users on purpose: the row must
-- outlive the account it records. It holds only the id and the state.
--
-- Depends on 20260928110000 (job layer).

begin;

select pgmq.create('erasure');

create table if not exists public.erasure_requests (
  user_id      uuid primary key,
  state        text not null default 'requested' check (state in ('requested', 'media_purged', 'done')),
  requested_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_error   text
);

comment on table public.erasure_requests is
  'One row per account deletion: where it has reached, and the last error. Kept after the account is gone as the record of the erasure. Server-only.';

alter table public.erasure_requests enable row level security;
revoke all on public.erasure_requests from anon, authenticated;

create or replace function public.request_erasure(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.erasure_requests (user_id) values (p_user)
  on conflict (user_id) do nothing;
  -- A repeat request for an erasure still in progress queues another run;
  -- runs are idempotent, so the extra one only finishes sooner.
  if exists (select 1 from public.erasure_requests where user_id = p_user and state <> 'done') then
    perform public.jobs_enqueue('erasure', jsonb_build_object('user_id', p_user));
  end if;
end;
$$;

-- delete_account() without a session: what the worker runs. Deleting the
-- auth user cascades to everything keyed on it.
create or replace function public.erase_account_rows(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profiles where id = p_user;
  delete from auth.users where id = p_user;
end;
$$;

revoke all on function public.request_erasure(uuid) from public, anon, authenticated;
revoke all on function public.erase_account_rows(uuid) from public, anon, authenticated;
grant execute on function public.request_erasure(uuid) to service_role;
grant execute on function public.erase_account_rows(uuid) to service_role;

commit;
