-- Column-grant repairs for public.profiles.
--
-- 20260622100000_identity_surface_hardening replaced table-level grants with
-- an explicit column list. Every profiles column added after it shipped
-- without a grant, and with column-level grants a single ungranted column in
-- a SELECT fails the entire query with "permission denied for table
-- profiles" (42501). In the app this broke every profile screen ("User not
-- found"), moderator detection, and cross-device settings sync.
--
-- Rule going forward: any migration that adds a profiles column the client
-- reads or writes MUST include the matching column grant.

-- Public role marker (20260627010000). Readable by everyone — moderator
-- identity is public by design (their decisions are attributed).
grant select (is_moderator) on public.profiles to anon, authenticated;

-- Privacy + settings-sync columns (20260625130000, 20260626090000).
-- Readable by signed-in users: peers legitimately need dm_privacy /
-- read_receipts / activity_status / online_status to render conversations;
-- the remaining toggles are low-sensitivity preferences. Not granted to anon.
grant select (
  is_private,
  dm_privacy,
  activity_status,
  online_status,
  read_receipts,
  ai_model,
  sensitive_content_filter,
  content_language,
  stream_responses,
  auto_save_chats
) on public.profiles to authenticated;

-- Settings sync writes the same columns to the caller's own row (the RLS
-- update policy already restricts writes to auth.uid() = id).
grant update (
  is_private,
  dm_privacy,
  activity_status,
  online_status,
  read_receipts,
  ai_model,
  sensitive_content_filter,
  content_language,
  stream_responses,
  auto_save_chats
) on public.profiles to authenticated;
