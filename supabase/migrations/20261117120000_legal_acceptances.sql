-- Who agreed to which version of the Terms of Service and the Privacy Policy, and when.
--
-- Until now sign-up showed the two documents as a line of text under the buttons, and nothing
-- anywhere recorded that anybody agreed. India's DPDP Act asks for a clear affirmative action and
-- a controller that can show it. Google and Apple sign-in create an account from either the
-- "Sign up" or the "Log in" side, so the agreement cannot live on one screen: the app shows a
-- gate after sign-in to anyone with no record for the current versions, which also asks again
-- whenever the text changes.
--
-- Same shape as user_presence: RLS on, no client grants, reached only through two functions that
-- take no user id (auth.uid() is the person). A person can only ever write a row for themselves,
-- so a client that records a wrong version only misleads itself.

create table if not exists public.legal_acceptances (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  kind        text        not null check (kind in ('terms', 'privacy')),
  version     text        not null check (char_length(version) between 1 and 16),
  accepted_at timestamptz not null default now(),
  primary key (user_id, kind, version)
);

alter table public.legal_acceptances enable row level security;
revoke all on public.legal_acceptances from anon, authenticated;

create or replace function public.record_legal_acceptance(p_terms text, p_privacy text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if coalesce(btrim(p_terms), '') = '' or coalesce(btrim(p_privacy), '') = '' then
    raise exception 'both versions are required' using errcode = '22023';
  end if;

  insert into public.legal_acceptances (user_id, kind, version)
  values (uid, 'terms', left(btrim(p_terms), 16)),
         (uid, 'privacy', left(btrim(p_privacy), 16))
  on conflict (user_id, kind, version) do nothing;
end;
$$;

revoke all on function public.record_legal_acceptance(text, text) from public, anon;
grant execute on function public.record_legal_acceptance(text, text) to authenticated;

-- What the caller has agreed to, newest first. Empty for anyone who has not agreed yet.
create or replace function public.get_my_legal_acceptance()
returns table (kind text, version text, accepted_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.kind, a.version, a.accepted_at
    from public.legal_acceptances a
   where a.user_id = auth.uid()
   order by a.accepted_at desc
$$;

revoke all on function public.get_my_legal_acceptance() from public, anon;
grant execute on function public.get_my_legal_acceptance() to authenticated;
