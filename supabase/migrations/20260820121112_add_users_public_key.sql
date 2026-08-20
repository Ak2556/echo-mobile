-- Add public_key column to users for E2E Encryption
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS public_key text;

-- Allow users to update their own public key
-- Note: users table already has an UPDATE policy for self, so we just need to ensure the column is accessible
