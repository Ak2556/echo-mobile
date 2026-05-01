-- Public buckets for profile photos and echo attachments.
-- Without policies on storage.objects, uploads fail with:
-- "new row violates row-level security policy"

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('echo-media', 'echo-media', true)
on conflict (id) do nothing;

-- Paths must be `<auth.uid()>/<filename>` (see lib/supabaseEchoApi.ts).

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_authenticated_insert_own_prefix" on storage.objects;
create policy "avatars_authenticated_insert_own_prefix"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "avatars_authenticated_update_own_prefix" on storage.objects;
create policy "avatars_authenticated_update_own_prefix"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "avatars_authenticated_delete_own_prefix" on storage.objects;
create policy "avatars_authenticated_delete_own_prefix"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "echo_media_public_read" on storage.objects;
create policy "echo_media_public_read"
  on storage.objects for select
  using (bucket_id = 'echo-media');

drop policy if exists "echo_media_authenticated_insert_own_prefix" on storage.objects;
create policy "echo_media_authenticated_insert_own_prefix"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'echo-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "echo_media_authenticated_update_own_prefix" on storage.objects;
create policy "echo_media_authenticated_update_own_prefix"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'echo-media'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'echo-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "echo_media_authenticated_delete_own_prefix" on storage.objects;
create policy "echo_media_authenticated_delete_own_prefix"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'echo-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );
