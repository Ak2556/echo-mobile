-- Structured, queryable Expenses data — mirrors the local-first ExpensesDoc so
-- the server can aggregate income/spend by month & category for insights, AI
-- coaching, and budget notifications. Owner-scoped RLS; blob stays authoritative.

create table if not exists public.expense_tx (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  client_id  text not null,
  type       text not null check (type in ('income', 'expense')),
  amount     numeric not null default 0,
  category   text,
  note       text,
  date       date not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.expense_settings (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  budget     numeric,
  currency   text,
  updated_at timestamptz not null default now()
);

create index if not exists expense_tx_user_date_idx on public.expense_tx (user_id, date desc);
create index if not exists expense_tx_user_cat_idx on public.expense_tx (user_id, category);

do $$
declare t text;
begin
  foreach t in array array['expense_tx','expense_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "own %1$s — select" on public.%1$I for select using (auth.uid() = user_id)$p$, t);
    execute format($p$create policy "own %1$s — insert" on public.%1$I for insert with check (auth.uid() = user_id)$p$, t);
    execute format($p$create policy "own %1$s — update" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$, t);
    execute format($p$create policy "own %1$s — delete" on public.%1$I for delete using (auth.uid() = user_id)$p$, t);
  end loop;
end $$;

-- This-month money summary shared by the app / AI / budget notifications.
create or replace function public.expense_stats(p_user uuid default auth.uid())
returns table (
  income_month  numeric,
  expense_month numeric,
  net_month     numeric,
  tx_count      int,
  budget        numeric,
  currency      text
)
language sql stable security invoker as $$
  select
    coalesce(sum(amount) filter (where type = 'income'  and date >= date_trunc('month', current_date)::date), 0),
    coalesce(sum(amount) filter (where type = 'expense' and date >= date_trunc('month', current_date)::date), 0),
    coalesce(sum(amount) filter (where type = 'income'  and date >= date_trunc('month', current_date)::date), 0)
      - coalesce(sum(amount) filter (where type = 'expense' and date >= date_trunc('month', current_date)::date), 0),
    count(*) filter (where date >= date_trunc('month', current_date)::date)::int,
    (select budget from public.expense_settings where user_id = p_user),
    (select currency from public.expense_settings where user_id = p_user)
  from public.expense_tx
  where user_id = p_user;
$$;
