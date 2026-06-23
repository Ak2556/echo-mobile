# Accessibility — manual test results

Use this file to log VoiceOver findings during the pre-submission QA pass.

## How to test

1. iOS Simulator → Settings → Accessibility → VoiceOver → On
2. Use Ctrl+Option+Arrow to navigate between elements
3. Two-finger swipe down to read everything from the current element

## Test flows

| Flow | Status | Notes |
| --- | --- | --- |
| Cold start -> onboarding -> sign-up | Not run | |
| Discover -> like / repost / comment a card | Not run | |
| Open a thread -> reply -> back | Not run | |
| Profile -> settings -> account deletion (cancel before confirming) | Not run | |
| Switch theme and accent color | Not run | |
| Trigger ConsentBanner after clearing MMKV -> Accept -> Decline | Not run | |
| Send a message that hits the rate limit (>30/h) | Not run | |
| Edit profile -> upload avatar -> save | Not run | |

## Findings

(Log any issues found here. Include the screen, the element, and the
expected announcement vs. the actual announcement.)
