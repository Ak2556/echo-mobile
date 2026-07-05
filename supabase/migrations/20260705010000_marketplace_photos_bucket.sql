-- The marketplace-photos bucket referenced by uploadListingImages was never
-- provisioned — 20260623000000_marketplace_listings created the table but no
-- storage, so creating a listing with photos failed at createSignedUploadUrl
-- ("Bucket not found"). Public bucket: listing photos are public product
-- imagery served via getPublicUrl.

INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace-photos', 'marketplace-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Sellers upload to their own subfolder: marketplace-photos/<uid>/...
DROP POLICY IF EXISTS "marketplace_photos_upload" ON storage.objects;
CREATE POLICY "marketplace_photos_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'marketplace-photos'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read (the bucket is public; this covers REST reads too).
DROP POLICY IF EXISTS "marketplace_photos_read" ON storage.objects;
CREATE POLICY "marketplace_photos_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'marketplace-photos');

-- Sellers manage their own uploads.
DROP POLICY IF EXISTS "marketplace_photos_delete" ON storage.objects;
CREATE POLICY "marketplace_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'marketplace-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
