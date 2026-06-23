alter table public.reports
  add column if not exists status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists action_taken text,
  add column if not exists internal_notes text;

create index if not exists reports_status_created_idx
  on public.reports (status, created_at);
