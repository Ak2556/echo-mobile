-- Make dm-media bucket private: authenticated-only reads, no public CDN URLs
UPDATE storage.buckets SET public = false WHERE id = 'dm-media';
