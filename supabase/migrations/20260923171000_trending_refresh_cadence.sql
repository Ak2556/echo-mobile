-- Rebuild the trending view four times an hour instead of twelve.
--
-- refresh_trending_echoes ran every 5 minutes: 288 full rebuilds a day, and the
-- most frequent write job in the system. The score it maintains decays over
-- hours — a post's rank barely moves in five minutes — so the freshness bought
-- by that cadence was never visible to anyone, while every rebuild rewrote the
-- view and its two indexes.
--
-- Fifteen minutes keeps the feed current within a fraction of the score's own
-- half-life. Nothing else changes, and this is one line to put back.

begin;

select cron.unschedule('refresh_trending_echoes');

select cron.schedule(
  'refresh_trending_echoes',
  '*/15 * * * *',
  $cron$refresh materialized view concurrently public.trending_echoes_mv;$cron$
);

commit;
