// Turn RevenueCat's view of a subscriber into Echo's one entitlement row.
//
// The webhook no longer interprets events. Deciding state from event types got
// it wrong in ways that are easy to miss: CANCELLATION only turns auto-renew
// off (access continues to the period end), UNCANCELLATION and PRODUCT_CHANGE
// were read as downgrades, and events can arrive out of order. RevenueCat's
// subscriber endpoint returns the resolved state, so a sync from it is right
// whichever event prompted it, however often it runs.
//
// Entitlement identifiers in RevenueCat must match Echo's plan ids ('plus',
// 'pro', 'founder'); any other identifier is ignored.

export type PlanId = 'plus' | 'pro' | 'founder';
type Source = 'app_store' | 'play_store' | 'stripe' | 'manual';

export interface EntitlementRow {
  plan_id: PlanId | 'free';
  status: 'active' | 'trialing' | 'expired';
  source: Source;
  current_period_end: string | null;
}

interface RcEntitlement {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string;
}

interface RcSubscription {
  store?: string;
  period_type?: string;
}

export interface RcSubscriber {
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcSubscription>;
}

const RANK: Record<PlanId, number> = { plus: 1, pro: 2, founder: 3 };

function isPlan(id: string): id is PlanId {
  return id === 'plus' || id === 'pro' || id === 'founder';
}

function sourceOf(store: string | undefined): Source {
  if (store === 'app_store' || store === 'mac_app_store') return 'app_store';
  if (store === 'play_store') return 'play_store';
  if (store === 'stripe') return 'stripe';
  return 'manual'; // promotional grants and anything new
}

/** Access continues through a billing grace period, as the stores intend. */
function activeUntil(e: RcEntitlement): number {
  if (!e.expires_date) return Infinity; // lifetime
  const ends = [e.expires_date, e.grace_period_expires_date].map((d) => (d ? Date.parse(d) : NaN)).filter(Number.isFinite);
  return ends.length ? Math.max(...ends) : NaN;
}

/**
 * The highest plan the subscriber has access to now, or an 'expired' row when
 * they have none (so a lapsed subscription is written down, not left as it was).
 */
export function entitlementFor(subscriber: RcSubscriber, now: number): EntitlementRow {
  let best: { plan: PlanId; e: RcEntitlement; until: number } | null = null;
  for (const [id, e] of Object.entries(subscriber.entitlements ?? {})) {
    if (!isPlan(id)) continue;
    const until = activeUntil(e);
    if (!(until > now)) continue;
    if (!best || RANK[id] > RANK[best.plan]) best = { plan: id, e, until };
  }
  if (!best) return { plan_id: 'free', status: 'expired', source: 'app_store', current_period_end: null };
  const sub = best.e.product_identifier ? subscriber.subscriptions?.[best.e.product_identifier] : undefined;
  return {
    plan_id: best.plan,
    status: sub?.period_type === 'trial' ? 'trialing' : 'active',
    source: sourceOf(sub?.store),
    current_period_end: Number.isFinite(best.until) ? new Date(best.until).toISOString() : null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Echo users an event concerns. A TRANSFER names both sides and no
 * app_user_id. Anonymous RevenueCat ids ($RCAnonymousID:...) are not Echo
 * users; their purchase reaches Echo when it is transferred or aliased to one.
 */
export function usersInEvent(event: {
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
}): string[] {
  const ids = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)))];
}
