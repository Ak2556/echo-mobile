-- DM image previews need stable URLs for native image renderers.
-- Message rows remain RLS-protected; media objects are unguessable UUID/user
-- scoped paths, but the object URL itself must be readable by the receiver.

insert into storage.buckets (id, name, public)
values ('dm-media', 'dm-media', true)
on conflict (id) do update set public = true;

drop policy if exists "dm_media_public_read" on storage.objects;
create policy "dm_media_public_read" on storage.objects
  for select
  using (bucket_id = 'dm-media');
