# Security policy

Echo is a social app with direct messages, uploaded media and an AI assistant, so reports of
vulnerabilities are taken seriously and handled privately.

## Reporting a vulnerability

**Please do not open a public issue, pull request or discussion for a security problem.**

Report it by email to **security@downloadecho.com** (also reachable from
[downloadecho.com](https://downloadecho.com)). Include:

- what you found and where (a URL, an endpoint, a function or a screen)
- steps to reproduce, or a short proof of concept
- what you think an attacker could do with it
- whether you have already told anyone else

You do not need to have a fix. A clear reproduction is the most useful thing you can send.

## What to expect

| | |
|---|---|
| Acknowledgement | within 3 working days |
| First assessment | within 7 days: whether we can reproduce it, and how serious we think it is |
| Fix | prioritised by impact; you will be told when it ships |
| Credit | with your permission, in the release notes. We are a small team and do not run a paid bounty |

## Scope

In scope:

- the mobile, web and desktop apps built from this repository
- the Supabase project they talk to: row-level security, RPCs, edge functions, storage
- the Cloudflare media worker in [`cloudflare/`](cloudflare/)
- end-to-end encryption of one-to-one text messages ([`lib/e2ee/`](lib/e2ee/))

Out of scope:

- denial of service and volumetric load testing
- social engineering of maintainers or users
- findings that need a rooted or jailbroken device, or physical access to an unlocked one
- vulnerabilities in third-party services themselves (Supabase, Cloudflare, Google, Expo): please
  report those to the vendor
- missing hardening that has no demonstrable impact

## Testing guidelines

- Use your own accounts. Do not read, change or delete other people's data.
- Stop as soon as you have shown the problem; do not pivot further into the system.
- Do not run automated scanners against production at high volume.

Good-faith research that follows these guidelines will not be pursued legally.

## What the design does and does not claim

Echo's security model is described in [`docs/architecture/05-security-and-privacy.md`](docs/architecture/05-security-and-privacy.md),
and the limits of its encryption in [`docs/design/dm-e2ee.md`](docs/design/dm-e2ee.md). Two claims
are deliberately **not** made: end-to-end encryption beyond one-to-one text messages, and visual
moderation of video.

## Supported versions

Only the latest build from `main` is supported. Updates reach installed apps over the air, so a fix
normally ships without a store release.
