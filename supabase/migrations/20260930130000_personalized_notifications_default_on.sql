-- Personalized notifications: on by default, one switch to turn off.
--
-- 20260718140000 made this strictly opt-in on DSA/GDPR grounds. By 2026-09-30
-- the result was that it reached nobody: 1 of 48 accounts had turned it on, and
-- the hourly fan-out sent one nudge in a week. Echo now launches India-only with
-- the EU excluded (see the compliance-territory decision), so the EU basis for
-- mandatory opt-in does not apply. Under India's DPDP Act (binding May 2027) this
-- is covered by notice plus an easy withdrawal: the privacy policy (v3.3) states
-- it, Settings → Privacy → Personalized Notifications turns it off, and the first
-- nudge each person receives says where that switch is.
--
-- What it processes is small: the hours a person usually opens Echo and which
-- part of the app they use most (notification_profiles), uploaded by the app.
--
-- If Echo ever launches in the EU, this must go back to opt-in for EU users.
--
-- Existing accounts are switched on as well, approved by the owner on
-- 2026-09-30. Nobody can be told apart as having chosen "off": the setting was
-- off by default and only one account had ever changed it (to on).

alter table public.profiles
  alter column personalized_notifications set default true;

update public.profiles
   set personalized_notifications = true
 where personalized_notifications = false;

comment on column public.profiles.personalized_notifications is
  'Personalized notification timing and content (best hours + top surface in notification_profiles). On by default since 2026-09-30 (India-only launch; notice in privacy policy v3.3); users turn it off in Settings → Privacy. Must be opt-in for any EU launch.';
