# E2E flows (Maestro)

End-to-end UI smoke tests for the Echo app, run against a booted iOS simulator
with the dev build installed and signed into a test account.

## Prerequisites
- Maestro CLI: `curl -Ls "https://get.maestro.mobile.dev" | bash` (needs a JRE)
- A booted simulator running the dev build:
  - `xcrun simctl boot <udid>` then build/install via `xcodebuild` (sim SDK,
    `CODE_SIGNING_ALLOWED=NO`) + `xcrun simctl install`, with Metro running
    (`npx expo start --dev-client`).
- Only **one** simulator booted (Maestro errors on multiple devices).

## Run
```bash
export PATH="$PATH:$HOME/.maestro/bin"
maestro test e2e/ci-launch.yaml    # cold launch + legal routes (no account needed)
maestro test e2e/smoke.yaml        # bottom-tab navigation      (needs a session)
maestro test e2e/messaging.yaml    # DM inbox + thread render   (needs a session + seeded data)
maestro test e2e/                  # whole suite
```

## Conventions
- Flows are **non-destructive**: they don't send real messages or create
  content in real conversations.
- Assert on rendered text (headers, message bubbles). RN `TextInput`
  placeholders and low-contrast subtitles are **not** exposed to accessibility,
  and icon-only buttons need `accessibilityLabel`s before they can be driven —
  see the a11y-label pass.


## Which flow runs where

| Flow | Needs a signed-in account | Runs in CI |
|---|---|---|
| `ci-launch.yaml` | no | yes, on every PR touching app code |
| `smoke.yaml` | yes | no |
| `messaging.yaml` | yes, plus a seeded conversation | no |

Sign-in is a one-time code sent to a real inbox, so CI cannot complete it.
`ci-launch.yaml` therefore asserts only what is true on a fresh install. That
still catches the failures worth catching on a pull request: the bundle failing
to build, a native module missing from the prebuild, a crash on launch, or the
router failing to resolve the initial route.

`smoke.yaml` and `messaging.yaml` stay manual until there is a seeded test
account with a bypass for the OTP step. If you add one, move them into
`.github/workflows/maestro-e2e.yml` alongside `ci-launch.yaml`.

> Removed 2026-08-23: `.maestro/smoke-test.yaml`. It declared
> `appId: com.echo.app` (the real id is `com.ak2556.echo`, so the app never
> launched) and drove a password login screen that does not exist. It was
> referenced by CI but had never run.
