-- profiles.show_active: a column nothing reads or writes. It came in with messaging_settings_phase0
-- (20260729160000), no function, view, policy or index mentions it, no client file has ever
-- referenced it (git log -S), and every profile still holds the default (true). The two privacy
-- switches that matter are online_status (the dot) and activity_status (the phrase).
--
-- Deliberately NOT dropped here, because builds that predate the presence OTA still use them:
--   * profiles.last_seen_at: old builds select it in their profile query, and a missing column fails
--     the whole select. It stays null forever (ping_presence no longer writes it).
--   * get_dm_conversations.other_last_seen_at: always null; the client maps it with `?? null`.
-- Both go in a later migration once every active user has run a build that heartbeats
-- (user_presence has a row for them). See docs/superpowers/specs/2026-10-16-presence-design.md section 6.

alter table public.profiles drop column if exists show_active;
