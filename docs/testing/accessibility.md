# Accessibility — manual test results

Use this file to log VoiceOver findings during the pre-submission QA pass.

## How to test

1. iOS Simulator → Settings → Accessibility → VoiceOver → On
2. Use Ctrl+Option+Arrow to navigate between elements
3. Two-finger swipe down to read everything from the current element

## Test flows

| Flow | Status | Notes |
| --- | --- | --- |
| Cold start → onboarding → sign-up | TODO | |
| Discover → like / repost / comment a card | TODO | |
| Open a thread → reply → back | TODO | |
| Profile → settings → account deletion (cancel before confirming) | TODO | |
| Switch theme & accent color | TODO | |
| Trigger ConsentBanner (clear MMKV first) → Accept → Decline | TODO | |
| Send a message that hits the rate limit (>30/h) | TODO | |
| Edit profile → upload avatar → save | TODO | |

## Findings

(Log any issues found here. Include the screen, the element, and the
expected announcement vs. the actual announcement.)
