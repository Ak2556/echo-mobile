CREATE TABLE IF NOT EXISTS public.ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    advertiser_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    campaign_name TEXT NOT NULL,
    media_url TEXT,
    headline TEXT NOT NULL,
    body TEXT,
    call_to_action TEXT NOT NULL DEFAULT 'Learn More',
    target_url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    views BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0
);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active ads are viewable by everyone" ON public.ads
    FOR SELECT
    USING (is_active = true);

CREATE POLICY "Advertisers can manage their own ads" ON public.ads
    FOR ALL
    USING (auth.uid() = advertiser_id)
    WITH CHECK (auth.uid() = advertiser_id);

CREATE OR REPLACE FUNCTION increment_ad_view(ad_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.ads SET views = views + 1 WHERE id = ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_ad_click(ad_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.ads SET clicks = clicks + 1 WHERE id = ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_ad_view TO authenticated, anon;
GRANT EXECUTE ON FUNCTION increment_ad_click TO authenticated, anon;
