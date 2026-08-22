ALTER TABLE public.ads 
ADD COLUMN budget_amount NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN razorpay_order_id TEXT,
ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending';

-- When payment is pending, ad should not be active
CREATE OR REPLACE FUNCTION check_ad_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status != 'paid' THEN
    NEW.is_active = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_ad_payment_status
BEFORE INSERT OR UPDATE ON public.ads
FOR EACH ROW
EXECUTE FUNCTION check_ad_payment_status();
