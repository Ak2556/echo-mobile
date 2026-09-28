-- Circuit breaker state for model providers, shared by every edge function.
--
-- Each isolate used to learn a provider was down only by calling it: on a
-- free-tier quota every chat, moderation, voice and translation request paid
-- a failed round trip (twice, with the Gemini-then-OpenRouter fallback) until
-- the quota reset. supabase/functions/_shared/breaker.ts reads this row
-- (cached for five seconds) and, while open_until is in the future, answers
-- for the provider without calling it.

begin;

create table if not exists public.provider_breaker (
  provider   text primary key,
  failures   integer not null default 0,
  open_until timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.provider_breaker is
  'Consecutive transient failures per model provider, and until when calls are refused. Server-only.';

alter table public.provider_breaker enable row level security;
revoke all on public.provider_breaker from anon, authenticated;

create or replace function public.breaker_state(p_provider text)
returns table (failures integer, open_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.failures, b.open_until from public.provider_breaker b where b.provider = p_provider;
$$;

-- p_ok resets the circuit. A failure counts one more; it opens the circuit for
-- the provider's Retry-After when it sent one, otherwise from the third
-- consecutive failure for 30s, doubling each further failure, at most an hour.
create or replace function public.breaker_record(p_provider text, p_ok boolean, p_retry_after integer)
returns table (failures integer, open_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failures integer;
begin
  if p_ok then
    update public.provider_breaker b
       set failures = 0, open_until = null, updated_at = now()
     where b.provider = p_provider;
    return query select 0, null::timestamptz;
    return;
  end if;

  insert into public.provider_breaker as b (provider, failures, updated_at)
  values (p_provider, 1, now())
  on conflict (provider) do update set failures = b.failures + 1, updated_at = now()
  returning b.failures into v_failures;

  update public.provider_breaker b
     set open_until = case
           when coalesce(p_retry_after, 0) > 0
             then now() + make_interval(secs => least(p_retry_after, 3600))
           when v_failures >= 3
             then now() + make_interval(secs => least(3600, 30 * power(2, v_failures - 3)::integer))
           else b.open_until
         end
   where b.provider = p_provider;

  return query select b.failures, b.open_until from public.provider_breaker b where b.provider = p_provider;
end;
$$;

revoke all on function public.breaker_state(text) from public, anon, authenticated;
revoke all on function public.breaker_record(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.breaker_state(text) to service_role;
grant execute on function public.breaker_record(text, boolean, integer) to service_role;

commit;
