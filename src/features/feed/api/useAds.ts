import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../shared/lib/supabase';
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

export function useRandomAd() {
  return useQuery({
    queryKey: ['random-ad'],
    queryFn: async () => {
      if (!isSupabaseRemote()) return null;
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
