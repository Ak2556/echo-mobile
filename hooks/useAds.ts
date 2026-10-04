import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { isSupabaseRemote } from '../lib/core/remoteConfig';

export interface AdItem {
  id: string;
  advertiser_id: string;
  campaign_name: string;
  media_url?: string;
  headline: string;
  body?: string;
  call_to_action: string;
  target_url: string;
  advertiser?: {
    username: string;
    display_name: string;
    avatar_url: string;
  };
}

/**
 * Whether this account may be shown advertising at all.
 *
 * Asks Postgres rather than deciding on the device: `can_be_profiled()` reads
 * the date of birth the client cannot see and fails closed on unknown age, so
 * an account that predates the age gate gets no ads until it supplies one.
 * India's DPDP Act 2023 prohibits targeted advertising directed at under-18s.
 */
export function useCanSeeAds() {
  return useQuery({
    queryKey: ['can-see-ads'],
    queryFn: async () => {
      if (!isSupabaseRemote()) return false;
      const { data, error } = await supabase.rpc('can_be_profiled');
      if (error) return false; // fail closed
      return data === true;
    },
    staleTime: 15 * 60 * 1000,
  });
}

export function useRandomAd() {
  const { data: canSeeAds } = useCanSeeAds();

  return useQuery({
    // Keyed on eligibility so turning 18 — or supplying a DOB — refetches
    // instead of serving a cached "no ads" result forever.
    queryKey: ['random-ad', canSeeAds === true],
    enabled: canSeeAds === true,
    queryFn: async () => {
      if (!isSupabaseRemote()) return null;
      if (canSeeAds !== true) return null;
      // Fetch active ads
      const { data, error } = await supabase
        .from('ads')
        .select(`
          *,
          advertiser:advertiser_id (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('is_active', true)
        .limit(10);
        
      if (error || !data || data.length === 0) return null;
      // Pick a random ad
      const ad = data[Math.floor(Math.random() * data.length)];
      return ad as AdItem;
    },
    staleTime: 60000,
  });
}

export async function trackAdView(adId: string) {
  if (!isSupabaseRemote()) return;
  await supabase.rpc('increment_ad_view', { ad_id: adId });
}

export async function trackAdClick(adId: string) {
  if (!isSupabaseRemote()) return;
  await supabase.rpc('increment_ad_click', { ad_id: adId });
}

// NOTE: You must install react-native-razorpay (e.g. npm install react-native-razorpay)
// and run npx expo prebuild for this to work natively.

/**
 * Save the ad, have the server bind a Razorpay order to it, then open checkout.
 *
 * The order is created server-side for an ad that already exists, because the
 * server has to own both the price and the order id: guard_client_writes
 * discards a client-supplied budget_amount or razorpay_order_id (otherwise one
 * rupee could buy any ad). The old flow created the order first and wrote its
 * id from the client, the guard dropped it, and the webhook could never find
 * the ad a payment was for. The webhook activates the ad once Razorpay
 * confirms the capture; nothing here marks it paid.
 */
export async function createAndPayAd(adData: Partial<AdItem>, amountInINR: number) {
  if (!isSupabaseRemote()) throw new Error('Supabase not connected');

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Not logged in');

  // 1. Save the ad. It is pending and inactive until the webhook settles it.
  const { data: adRecord, error: adError } = await supabase
    .from('ads')
    .insert({ ...adData, advertiser_id: session.session.user.id })
    .select('id')
    .single();
  if (adError || !adRecord) throw new Error('Failed to save ad details');

  // 2. The server prices the ad and binds an order to it (idempotent per ad).
  const { data: order, error: orderError } = await supabase.functions.invoke('razorpay-create-order', {
    body: { ad_id: adRecord.id, budget_inr: amountInINR },
  });
  if (orderError || !order?.id) throw new Error('Failed to create payment order');

  // 3. Checkout.
  const options = {
    description: 'Echo Ad Campaign',
    currency: order.currency ?? 'INR',
    key: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID,
    amount: order.amount,
    name: 'Echo Ads',
    order_id: order.id,
    theme: { color: '#000000' },
  };

  let RazorpayCheckout: { open: (o: typeof options) => Promise<{ razorpay_payment_id: string }> } | undefined;
  try {
    // Required lazily so a build without the native module still starts.
    RazorpayCheckout = require('react-native-razorpay').default;
  } catch {
    RazorpayCheckout = undefined;
  }
  if (!RazorpayCheckout) throw new Error('Razorpay is not linked natively. Run npx expo prebuild and rebuild.');

  try {
    const data = await RazorpayCheckout.open(options);
    return { success: true, paymentId: data.razorpay_payment_id, adId: adRecord.id };
  } catch {
    throw new Error('Payment cancelled or failed');
  }
}
