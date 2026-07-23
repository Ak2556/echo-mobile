-- Expand synced mini-app documents and add private media storage for capture tools.

alter table public.mini_app_data
  drop constraint if exists mini_app_data_app_check;

alter table public.mini_app_data
  add constraint mini_app_data_app_check
  check (app in (
    'calculator',
    'converter',
    'bill-splitter',
    'pomodoro',
    'learn',
    'password-gen',
    'world-clock',
    'markdown',
    'tasks',
    'planner',
    'shopping-list',
    'bmi',
    'fitness',
    'camera',
    'voice-memo',
    'notes',
    'habits',
    'expenses'
  ));

insert into storage.buckets (id, name, public)
values ('mini-app-media', 'mini-app-media', false)
on conflict (id) do update set public = false;

drop policy if exists "mini_app_media_upload" on storage.objects;
create policy "mini_app_media_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'mini-app-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "mini_app_media_read" on storage.objects;
create policy "mini_app_media_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'mini-app-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "mini_app_media_update" on storage.objects;
create policy "mini_app_media_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'mini-app-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'mini-app-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "mini_app_media_delete" on storage.objects;
create policy "mini_app_media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'mini-app-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
