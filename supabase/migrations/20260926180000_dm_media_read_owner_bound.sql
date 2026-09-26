-- Legacy DM media: stop authorising reads by a pointer the reader controls.
--
-- DM photos and voice notes are not end-to-end encrypted yet (their own plan),
-- so for launch they are protected by access control alone. New media lives in
-- R2 behind the worker's /dm-media route, which checks membership of the
-- conversation named in the key. Media sent before that move still sits in the
-- private Supabase bucket `dm-media`, and its read policy (20260809100000)
-- granted a file to anyone in ANY conversation holding a message whose
-- media_url merely ENDED WITH the file's name:
--
--   dm.media_url LIKE '%' || objects.name
--
-- media_url is written by the sender on insert. Anyone who learned a file's
-- path could send a message in their own chat with media_url set to it, and the
-- policy would then hand them the file. It was also a LIKE pattern, so `%` and
-- `_` in a name were wildcards, and group members were never covered.
--
-- Now a message can vouch for a file only if:
--   - its sender owns the file (first path segment), so nobody can point at
--     someone else's upload;
--   - it matches the file exactly (the stored value is the name, or ends in
--     '/' || name), with no wildcards;
--   - the reader is a member of that message's conversation
--     (is_dm_conversation_member, which also covers groups).
--
-- Checked against production before writing: both messages that still
-- reference this bucket point at files owned by their own sender, so every
-- reader who could see them before still can. No message uses voice_url.

drop policy if exists "dm_media_read" on storage.objects;
create policy "dm_media_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dm-media' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.direct_messages dm
         where dm.sender_id::text = (storage.foldername(objects.name))[1]
           and (
             dm.media_url = objects.name
             or right(dm.media_url, length(objects.name) + 1) = '/' || objects.name
             or dm.voice_url = objects.name
             or right(dm.voice_url, length(objects.name) + 1) = '/' || objects.name
           )
           and public.is_dm_conversation_member(dm.conversation_id, (select auth.uid()))
      )
    )
  );
