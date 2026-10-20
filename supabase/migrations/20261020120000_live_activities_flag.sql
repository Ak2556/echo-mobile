-- Kill switch for Live Activities (Dynamic Island / lock-screen card on iOS).
-- Compiled default is on; this row lets it be turned off without a build.
insert into public.feature_flags (key, enabled, note)
values ('liveActivities', true, 'Dynamic Island / lock-screen card for a running Pomodoro, a voice memo being recorded, and a photo or video post uploading. Off = no new cards; one already showing can still end.')
on conflict (key) do nothing;
