-- Re-apply DM media storage bucket and policies.
-- DM images live in a private bucket and are rendered through signed URLs.

insert into storage.buckets (id, name, public)
values ('dm-media', 'dm-media', false)
on conflict (id) do update set public = false;

drop policy if exists "dm_media_upload" on storage.objects;
create policy "dm_media_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dm-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dm_media_read" on storage.objects;
create policy "dm_media_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'dm-media');

drop policy if exists "dm_media_update" on storage.objects;
create policy "dm_media_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'dm-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'dm-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dm_media_delete" on storage.objects;
create policy "dm_media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'dm-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
