-- Subscription tiers and exclusive entitlements.
--
-- Clients cannot grant themselves paid or exclusive plans. Entitlements are
-- written only by trusted server/admin flows and read by Edge Functions when
-- enforcing rate limits.

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null default 'free'
    check (plan_id in ('free', 'plus', 'pro', 'founder')),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'cancelled', 'expired')),
  source text not null default 'manual'
    check (source in ('manual', 'app_store', 'play_store', 'stripe', 'founder')),
  exclusive boolean not null default false,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_entitlements_plan_status_idx
  on public.user_entitlements(plan_id, status);

alter table public.user_entitlements enable row level security;

drop policy if exists user_entitlements_select_own on public.user_entitlements;
create policy user_entitlements_select_own
  on public.user_entitlements for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for normal users. Admin APIs and Edge
-- Functions use the service role when granting or inspecting entitlements.

alter table public.ai_rate_limits
  add column if not exists plan_id text not null default 'free'
    check (plan_id in ('free', 'plus', 'pro', 'founder')),
  add column if not exists limit_per_hour integer not null default 30;
