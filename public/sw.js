/* Echo service worker — hand-written, no Workbox.
 *
 * Workbox would add ~20KB and a build step to express three rules. At this size
 * it costs more than it explains, so this stays readable instead.
 *
 * WHY EACH RULE:
 *
 * 1. Cross-origin requests are never touched. Echo's live data is Supabase and
 *    its media is R2 — both other origins, both carrying auth. Caching a
 *    response that was authorised for one user risks serving it to the next,
 *    and a stale feed is worse than no feed. They pass straight through.
 *
 * 2. Navigations are network-first. The app shell changes on every deploy, so
 *    serving a cached document first would pin people to an old build. The
 *    cache is the offline fallback, not the default.
 *
 * 3. Same-origin static assets are cache-first. Expo fingerprints its bundles
 *    (/_expo/static/js/web/entry-<hash>.js), so a URL's contents never change —
 *    revalidating them would be pure latency for an answer we already have.
 */

const VERSION = 'echo-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  // Only the entry document is precached. Bundle filenames are hashed per
  // build, so listing them here would go stale the moment anything ships.
  event.waitUntil(caches.open(SHELL).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Drop caches from older VERSIONs so a deploy cannot leave a mixed bundle.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Rule 1: only same-origin GETs. Everything else is none of our business.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Rule 2: navigations — network first, cached shell only when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Rule 3: static assets — cache first, populate on miss.
  event.respondWith(
    caches.match(request).then((hit) =>
      hit ||
      fetch(request).then((res) => {
        // Opaque and error responses are not worth persisting.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(ASSETS).then((c) => c.put(request, copy));
        }
        return res;
      }),
    ),
  );
});
