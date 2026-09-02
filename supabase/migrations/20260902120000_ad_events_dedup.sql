-- Make ad counters mean something.
--
-- Before this, increment_ad_click(ad_id) and increment_ad_view(ad_id) checked
-- only that the caller was signed in and then blind-incremented:
--
--     UPDATE public.ads SET clicks = clicks + 1 WHERE id = ad_id;
--
-- so any authenticated user could add unlimited views or clicks to any ad, and
-- an ad_id matching nothing at all silently "succeeded" against zero rows.
-- Nobody had to attack it for the numbers to be wrong: AdCard fires a view on
-- every mount, and a FlashList remounts a card each time it scrolls back into
-- range, so honest scrolling already inflated impressions.
--
-- ads carry budget_amount / razorpay_order_id / payment_status. There is no
-- CPC or CPM logic — a campaign is a flat prepaid amount — so this is not
-- billing fraud. It is the number an advertiser judges the campaign by, and
-- decides whether to buy again on.
--
-- Counting model: one view and one click per user, per ad, per UTC day. The
-- primary key of ad_events is that rule; the counter moves only when the
-- insert actually creates a row.
--
-- NOT backfilled. No event history exists, so the current views/clicks totals
-- cannot be reconstructed and are left alone. They are trustworthy from here
-- forward, not retroactively.

-- `day` is UTC, so the boundary falls at 05:30 IST. That is fine for dedup;
-- moving it to a local day later is a default change, not a schema change.
create table if not exists public.ad_events (
  ad_id      uuid        not null references public.ads(id)  on delete cascade,
  user_id    uuid        not null references auth.users(id)  on delete cascade,
  kind       text        not null check (kind in ('view', 'click')),
  day        date        not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  primary key (ad_id, user_id, kind, day)
);

comment on table public.ad_events is
  'One row per user per ad per kind per UTC day. The primary key is the dedup '
  'rule for increment_ad_view / increment_ad_click — dropping it silently '
  'reopens unbounded counter inflation. scripts/audit-backend.mjs asserts it.';

-- The primary key leads with ad_id, so deleting an ad is indexed. Deleting a
-- USER is not, and account deletion already sequential-scans a dozen tables on
-- its cascade from auth.users. Do not add a fourteenth.
create index if not exists ad_events_user_id_idx on public.ad_events (user_id);

-- Nothing reads this table directly. Only the SECURITY DEFINER functions below
-- touch it, and they bypass RLS. Enabled with no policy = denied to every
-- client role, the same deliberate posture as thinking_fingerprints.
alter table public.ad_events enable row level security;

/**
 * Record that the current user saw or tapped an ad today.
 *
 * Returns true only when this is the first such event today — which is exactly
 * the condition under which the caller should move a counter.
 */
create or replace function public.record_ad_event(p_ad_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- ON CONFLICT DO NOTHING makes the repeat case cheap and race-free: two
  -- concurrent taps cannot both see "no row yet" and both increment.
  insert into public.ad_events (ad_id, user_id, kind)
  values (p_ad_id, v_uid, p_kind)
  on conflict do nothing;

  -- ROW_COUNT is an integer: 1 when the insert created a row, 0 on conflict.
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.increment_ad_view(ad_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A non-existent ad_id is now rejected by the ad_events foreign key instead
  -- of silently updating zero rows.
  if public.record_ad_event(ad_id, 'view') then
    update public.ads set views = views + 1 where id = ad_id;
  end if;
end;
$$;

create or replace function public.increment_ad_click(ad_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.record_ad_event(ad_id, 'click') then
    update public.ads set clicks = clicks + 1 where id = ad_id;
  end if;
end;
$$;

-- Match the grant posture established in 20260902104500: signed-in users only,
-- never anon or PUBLIC. CREATE OR REPLACE preserves existing grants, but the
-- new record_ad_event needs its defaults stripped.
revoke execute on function public.record_ad_event(uuid, text) from public, anon;
revoke execute on function public.increment_ad_view(uuid)      from public, anon;
revoke execute on function public.increment_ad_click(uuid)     from public, anon;

grant execute on function public.increment_ad_view(uuid)  to authenticated;
grant execute on function public.increment_ad_click(uuid) to authenticated;
-- record_ad_event is an internal helper: reachable only through the two
-- functions above, never called directly by a client.
