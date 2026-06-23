-- Real peer marketplace listings
-- Sellers post items/services with photos; buyers browse and message sellers.

create table if not exists public.marketplace_listings (
  id            uuid          primary key default gen_random_uuid(),
  seller_id     uuid          not null references public.profiles(id) on delete cascade,
  title         text          not null check (char_length(title) between 3 and 120),
  description   text          check (char_length(description) <= 2000),
  price         numeric(12,2) not null check (price >= 0),
  currency      text          not null default 'INR'
                              check (currency in ('INR','USD','EUR','GBP','AED','SGD','CAD','AUD')),
  category      text          not null default 'Other',
  condition     text          not null default 'Good'
                              check (condition in ('New','Like new','Good','Service')),
  photo_urls    text[]        not null default '{}',
  tags          text[]        not null default '{}',
  location_label text,
  fulfillment   text          default 'To be arranged',
  status        text          not null default 'active'
                              check (status in ('active','sold','paused','removed')),
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

alter table public.marketplace_listings enable row level security;

-- Any authenticated user can read active listings
create policy "read active listings"
  on public.marketplace_listings for select
  using (status = 'active');

-- Sellers can read all their own (including non-active)
create policy "sellers read own"
  on public.marketplace_listings for select
  using (auth.uid() = seller_id);

create policy "sellers insert"
  on public.marketplace_listings for insert
  with check (auth.uid() = seller_id);

create policy "sellers update own"
  on public.marketplace_listings for update
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

create policy "sellers delete own"
  on public.marketplace_listings for delete
  using (auth.uid() = seller_id);

-- Indexes
create index if not exists marketplace_listings_created_at_idx
  on public.marketplace_listings (created_at desc)
  where status = 'active';

create index if not exists marketplace_listings_seller_idx
  on public.marketplace_listings (seller_id);

create index if not exists marketplace_listings_category_idx
  on public.marketplace_listings (category)
  where status = 'active';

-- Auto-update updated_at
create or replace function public.set_marketplace_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger marketplace_listings_updated_at
  before update on public.marketplace_listings
  for each row execute function public.set_marketplace_updated_at();
