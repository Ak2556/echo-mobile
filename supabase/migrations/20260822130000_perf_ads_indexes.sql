-- Add missing indexes to improve Ad serving and querying performance
CREATE INDEX IF NOT EXISTS idx_ads_is_active ON public.ads(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ads_advertiser_id ON public.ads(advertiser_id);
