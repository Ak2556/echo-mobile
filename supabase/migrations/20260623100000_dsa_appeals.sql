-- DSA Art. 20 — Internal appeals mechanism.
-- Users can appeal a content-moderation decision (removal or dismissal).
-- Moderators review appeals and record an outcome.

create table if not exists public.appeals (
  id            uuid          primary key default gen_random_uuid(),
  report_id     uuid          not null references public.reports(id) on delete cascade,
  appellant_id  uuid          not null references public.profiles(id) on delete cascade,
  reason        text          not null check (char_length(reason) between 20 and 2000),
  status        text          not null default 'pending'
                              check (status in ('pending', 'upheld', 'overturned')),
  moderator_note text,
  created_at    timestamptz   not null default now(),
  resolved_at   timestamptz,
  -- One appeal per report per user.
  unique (report_id, appellant_id)
);

alter table public.appeals enable row level security;

-- Appellants can read and insert their own appeals.
create policy "appellants read own"
  on public.appeals for select
  using (auth.uid() = appellant_id);

create policy "appellants insert"
  on public.appeals for insert
  with check (
    auth.uid() = appellant_id
    -- Can only appeal reports that have been resolved or dismissed.
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_id
        AND r.reporter_id = auth.uid()
        AND r.status IN ('resolved', 'dismissed')
    )
  );

-- Moderators (service role via admin panel) handle the rest.

create index if not exists appeals_appellant_idx on public.appeals (appellant_id);
create index if not exists appeals_report_idx    on public.appeals (report_id);
create index if not exists appeals_status_idx    on public.appeals (status) where status = 'pending';

-- Notify appellant when their appeal is resolved.
create or replace function public.notify_on_appeal_resolved()
returns trigger language plpgsql security definer as $$
begin
  if new.status <> 'pending' and old.status = 'pending' then
    insert into public.notifications (actor_id, recipient_id, kind, target_id)
    select
      null,
      new.appellant_id,
      'appeal_resolved',
      new.id
    where not exists (
      select 1 from public.notifications
      where kind = 'appeal_resolved' and target_id = new.id
    );
  end if;
  return new;
end;
$$;

create trigger appeals_resolved_notify
  after update on public.appeals
  for each row execute function public.notify_on_appeal_resolved();
