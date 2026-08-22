-- Robust RevenueCat Webhook Pipeline

CREATE TABLE IF NOT EXISTS public.subscription_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    app_user_id TEXT NOT NULL,
    event_timestamp BIGINT NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    processing_status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INT NOT NULL DEFAULT 0,
    last_error TEXT
);

-- Index for quick duplicate/latest lookups
CREATE INDEX idx_sub_webhooks_user_time ON public.subscription_webhook_events (app_user_id, event_timestamp DESC);

-- Restrict RLS
ALTER TABLE public.subscription_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies for public: this is strictly an internal server-side table for the webhook processor

-- Ensure profiles has an entitlement field if it doesn't already
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'premium_entitlement') THEN
    ALTER TABLE public.profiles ADD COLUMN premium_entitlement TEXT DEFAULT 'free';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'premium_updated_at') THEN
    ALTER TABLE public.profiles ADD COLUMN premium_updated_at BIGINT DEFAULT 0;
  END IF;
END $$;
