import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { isSupabaseRemote } from '../../../../lib/remoteConfig';

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


export async function createAndPayAd(adData: Partial<AdItem>, amountInINR: number) {
  if (!isSupabaseRemote()) throw new Error('Supabase not connected');
  
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Not logged in');

  // 1. Ask Edge Function to create Razorpay Order
  const { data: orderData, error: orderError } = await supabase.functions.invoke('razorpay-create-order', {
    body: { amount: amountInINR * 100, currency: 'INR' }, // amount in paise
  });

  if (orderError || !orderData?.id) {
    throw new Error('Failed to create payment order');
  }

  // 2. Insert the Ad in 'pending' status with the order_id
  const { data: adRecord, error: adError } = await supabase.from('ads').insert({
    ...adData,
    budget_amount: amountInINR,
    razorpay_order_id: orderData.id,
    payment_status: 'pending',
    is_active: false // Explicitly false until paid
  }).select().single();

  if (adError) throw new Error('Failed to save ad details');

  
  // 3. Open Razorpay Checkout (Uncomment once react-native-razorpay is installed)
  const options = {
    description: 'Echo Ad Campaign',
    image: 'https://your-app-logo-url.png',
    currency: 'INR',
    key: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID, // Your Razorpay Key
    amount: orderData.amount,
    name: 'Echo Ads',
    order_id: orderData.id,
    theme: { color: '#000000' }
  };

  try {
    // Dynamically require to prevent native module missing crash on app startup
    const RazorpayCheckout = require('react-native-razorpay').default;
    if (!RazorpayCheckout) throw new Error("Razorpay not linked natively. Run npx expo prebuild and rebuild.");
    
    const data = await RazorpayCheckout.open(options);
    // On success, the webhook will automatically flip `is_active` to true
    return { success: true, paymentId: data.razorpay_payment_id, adId: adRecord.id };
  } catch (error) {
    throw new Error('Payment cancelled or failed');
  }
 
  
  return { success: true, orderId: orderData.id, adId: adRecord.id, status: 'awaiting_payment' };
}
