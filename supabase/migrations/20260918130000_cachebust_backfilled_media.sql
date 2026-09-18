-- Point the 44 backfilled images at a fresh cache key.
--
-- Those images were downscaled in R2 on 2026-09-18 (127.4 MB -> 17.3 MB, a
-- 1600px longest edge matching what lib/imageUploadPrep.ts has applied to new
-- uploads since 2026-09-11). The objects are correct. Nobody sees them.
--
-- cloudflare/src/index.ts caches /media by the FULL request URL with
-- `max-age=31536000, immutable`, on the stated assumption that these keys are
-- content-addressed by upload timestamp and never rewritten. The backfill broke
-- that assumption, and workers.dev has no zone, so there is no purge API and
-- the Cache API only evicts the colo you happen to reach. Measured after the
-- upload: every sampled URL returned cf-cache-status HIT with the old bytes.
--
-- The worker takes the R2 key from the path and the cache key from the whole
-- URL, so a query parameter is a new cache entry over the same object. Verified
-- against production before writing this: the plain URL returned 4,926,636
-- bytes, the same URL with ?v=2 returned 545,479.
--
-- Nothing in R2 changes here, and no other column does either. Safe to re-run:
-- a URL that already carries a version is left alone.
--
-- lib/mediaDownload.ts already strips the query string when it names a saved
-- file, and public.media_url_allowed matches the host before the '?', so the
-- provenance rules are unaffected.

begin;

with fixes(u) as (values
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/081617a3-059b-47c7-99c1-f2049ec3b0fc/1786348385705_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/081617a3-059b-47c7-99c1-f2049ec3b0fc/1786505538177_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/09de170d-4499-431f-86b7-e46af2447757/1788168554995_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/19bc2e73-f42a-422a-b74f-a55d6f4a7795/1777624156087_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/19bc2e73-f42a-422a-b74f-a55d6f4a7795/1786283714812_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/252cdd78-b245-4884-8c2c-c8cd387f0793/1786454993985_0.webp'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1777879729163_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1784102078091_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1786335507166_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1786335570068_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1786335702090_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1786335917598_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1786336437174_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1786336438976_1.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1786539231085_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1787087673030_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1787128718683_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1787128720002_1.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1787481908519_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1787658708931_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1787659148848_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1787659349623_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/d2b0367f-bdff-4ed3-9b71-026241450de8/1787788572935_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e036cc7b-5fbd-4833-b2ee-3c6a6cf54b61/1787040255120_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1783791940935_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1784803552360_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1784803570111_1.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1784989038682_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1785069022527_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1785652775666_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1785737915758_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1785812413960_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1786165538064_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1786347920245_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1786762700650_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1787225405056_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1787481816646_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1787481978729_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/e515430f-3afd-44b1-98bc-c39f72811931/1788877440545_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/edecc340-a934-42c6-b36f-52d1277ffc17/1785737951224_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/edecc340-a934-42c6-b36f-52d1277ffc17/1788154841749_0.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/edecc340-a934-42c6-b36f-52d1277ffc17/1788154844441_1.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/edecc340-a934-42c6-b36f-52d1277ffc17/1788154845722_2.jpg'),
  ('https://echo-mobile.at3236129.workers.dev/media/echo-media/f3667f99-7269-41f0-9cea-1be26e2e82e0/1786197350530_0.jpg')
)
update public.public_echoes e
set media_urls = (
  select array_agg(
    case
      when t.m in (select u from fixes) and position('?v=' in t.m) = 0
        then t.m || '?v=2'
      else t.m
    end
    order by t.ord
  )
  from unnest(e.media_urls) with ordinality as t(m, ord)
)
where exists (
  select 1 from unnest(e.media_urls) m
  where m in (select u from fixes) and position('?v=' in m) = 0
);

commit;
