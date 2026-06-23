# Universal Links — Setup checklist

Universal Links let `https://echo.app/e/<id>` open the Echo app directly from Mail, Messages, Safari, etc., bypassing Safari entirely. We have the iOS side wired (`app.json` → `ios.associatedDomains` includes `applinks:echo.app`) — three things still need to happen on the web side before launch:

## 1. Replace `TEAMID` in the AASA file

Open `docs/apple-app-site-association.json` and replace both `TEAMID` placeholders with your real Apple Developer Team ID. Find it at:

  https://developer.apple.com/account → Membership → Team ID (10-char alphanumeric)

## 2. Host the AASA file at the right URL

Apple fetches `https://echo.app/.well-known/apple-app-site-association` over HTTPS, **without** following redirects, with **Content-Type: application/json** and **no** file extension.

If you're hosting echo.app on:

- **Vercel / Netlify** — drop the file at `public/.well-known/apple-app-site-association` (no `.json` extension). Add a redirect or header rule so the response is served as `application/json`.
- **Cloudflare Pages** — same path. Configure a `_headers` file with `/.well-known/apple-app-site-association` → `Content-Type: application/json`.
- **Any custom server** — serve at that exact path with that exact content type. Disable any auth/redirects on the path.

Apple caches the file aggressively — once it's wrong, it's hard to debug. Validate before submitting:

```
curl -sIH "Accept: application/json" https://echo.app/.well-known/apple-app-site-association
```

Should return `200 OK` with `Content-Type: application/json`.

## 3. Add the deep-link route handler in the app

The handler already exists for `auth/callback` (OAuth deep links). For Echo URLs, we need to wire `/e/<id>` → router.push(`/thread/<id>`), `/u/<id>` → `/user/<id>`, `/c/<id>` → `/comments/<id>`.

Universal link routing should be verified during the final pre-submission build.

## 4. Test

After hosting the AASA file and a fresh build:

  - On the iPhone, open Notes
  - Paste `https://echo.app/e/<a-real-echo-id>`
  - Long-press the link
  - "Open in Echo" should appear in the share sheet
  - Tapping the link directly should open the app to that thread

If the link opens Safari instead, Apple's CDN didn't pick up the AASA. Solutions:
  - Verify content type is `application/json`
  - Verify the file is at the exact `.well-known/` path
  - Re-install the app (Apple re-checks AASA on install)
