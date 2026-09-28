-- Payment webhooks: record each event once, act through a guarded transition.
--
-- Neither pipeline is live yet (no purchase flow calls them), and both were
-- wrong in ways that only show once money moves:
--
-- RevenueCat inserted its dedupe row before processing, so a failure after it
-- was acknowledged as a duplicate on retry and the entitlement never applied.
-- It also wrote profiles.premium_entitlement, which nothing reads; the rate
-- limiter reads user_entitlements, which nothing wrote.
--
-- Razorpay updated ads by order id alone and answered 200 whatever happened.
-- guard_client_writes nulls a client-supplied order id, so no ad could ever
-- match: the customer would be charged and the ad never shown. There was no
-- event dedupe and no state check, so a replayed capture could re-activate an
-- ad after a refund or a takedown.
--
-- Depends on 20260928110000 (job layer).

begin;

select pgmq.create('entitlements');

-- ── RevenueCat ──────────────────────────────────────────────────────────────
-- Record the event and queue a sync for each Echo user it names, in one
-- transaction: a redelivery changes nothing, and a failure records nothing,
-- so RevenueCat's retry starts clean. The sync reads resolved state from
-- RevenueCat, so the order events arrive in does not matter.
--
-- subscriber_attributes (email, phone, and anything the app sets) are dropped
-- before storage: nothing here needs them.
create or replace function public.ingest_revenuecat_event(p_event jsonb, p_users uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscription_webhook_events (event_id, event_type, app_user_id, event_timestamp, payload)
  values (
    p_event->>'id',
    coalesce(p_event->>'type', 'UNKNOWN'),
    coalesce(p_event->>'app_user_id', ''),
    coalesce((p_event->>'event_timestamp_ms')::bigint, 0),
    p_event - 'subscriber_attributes'
  )
  on conflict (event_id) do nothing;
  if not found then
    return;
  end if;
  perform public.jobs_enqueue('entitlements', jsonb_build_object('user_id', u))
    from unnest(coalesce(p_users, '{}')) as u;
end;
$$;

-- The store's answer, written to the one row the rate limiter reads. A manual
-- or founder grant is never overwritten by a store sync.
create or replace function public.apply_store_entitlement(p_user uuid, p_row jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users where id = p_user) then
    return; -- the account is gone; there is nothing to entitle
  end if;
  insert into public.user_entitlements as ue (user_id, plan_id, status, source, current_period_end, updated_at)
  values (
    p_user,
    p_row->>'plan_id',
    p_row->>'status',
    p_row->>'source',
    (p_row->>'current_period_end')::timestamptz,
    now()
  )
  on conflict (user_id) do update
     set plan_id            = excluded.plan_id,
         status             = excluded.status,
         source             = excluded.source,
         current_period_end = excluded.current_period_end,
         updated_at         = now()
   where ue.source in ('app_store', 'play_store', 'stripe')
      or (ue.source = 'manual' and ue.plan_id = 'free');
end;
$$;

-- ── Razorpay ────────────────────────────────────────────────────────────────
create table if not exists public.payment_events (
  event_id    text primary key,
  event_type  text,
  received_at timestamptz not null default now(),
  payload     jsonb not null
);

comment on table public.payment_events is
  'One row per Razorpay webhook event, so a redelivery settles nothing twice. Server-only.';

alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;

-- pending -> paid, only for the ad bound to this order at exactly this price.
-- Razorpay sends payment.captured and order.paid for one payment; the second
-- finds the ad already paid and is not an anomaly. Anything else that matches
-- no pending ad is money taken for nothing, so it goes to the dead-letter
-- queue, which cron_health reports.
create or replace function public.settle_ad_payment(p_event_id text, p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay jsonb := p_payload #> '{payload,payment,entity}';
  v_order text := p_payload #>> '{payload,payment,entity,order_id}';
  v_ad uuid;
begin
  if v_order is null then
    return 'ignored';
  end if;

  insert into public.payment_events (event_id, event_type, payload)
  values (p_event_id, p_payload->>'event', p_payload)
  on conflict (event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  update public.ads
     set payment_status = 'paid',
         is_active      = true
   where razorpay_order_id = v_order
     and payment_status = 'pending'
     and round(budget_amount * 100) = (v_pay->>'amount')::numeric
     and upper(v_pay->>'currency') = 'INR'
  returning id into v_ad;

  if v_ad is not null then
    return 'settled';
  end if;
  if exists (select 1 from public.ads where razorpay_order_id = v_order and payment_status = 'paid') then
    return 'already_paid';
  end if;
  perform pgmq.send('dlq', jsonb_build_object(
    'queue', 'payments', 'kind', 'report', 'msg', p_payload,
    'error', 'payment matched no pending ad at its price: order ' || v_order, 'at', now()));
  return 'unmatched';
end;
$$;

revoke all on function public.ingest_revenuecat_event(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.apply_store_entitlement(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.settle_ad_payment(text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_revenuecat_event(jsonb, uuid[]) to service_role;
grant execute on function public.apply_store_entitlement(uuid, jsonb) to service_role;
grant execute on function public.settle_ad_payment(text, jsonb) to service_role;

commit;
