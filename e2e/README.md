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
maestro test e2e/smoke.yaml        # bottom-tab navigation
maestro test e2e/messaging.yaml    # DM inbox + thread render
maestro test e2e/                  # whole suite
```

## Conventions
- Flows are **non-destructive**: they don't send real messages or create
  content in real conversations.
- Assert on rendered text (headers, message bubbles). RN `TextInput`
  placeholders and low-contrast subtitles are **not** exposed to accessibility,
  and icon-only buttons need `accessibilityLabel`s before they can be driven —
  see the a11y-label pass.
