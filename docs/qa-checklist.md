# Echo — Pre-launch QA Checklist

Run this on a fresh install of the production-config build before each TestFlight push and before App Store submission. Treat any unchecked item as a P0 blocker.

Hardware coverage: at minimum **iPhone SE (3rd gen)**, **iPhone 12**, **iPhone 15 Pro Max**. Cover iOS 16, 17, 18.

---

## 1. First-run experience

- [ ] Cold launch from clean install → splash → onboarding within 3 seconds
- [ ] Signup wizard step 1: typing a username triggers debounced availability check; green check appears for free names; red error for taken
- [ ] Continue is disabled until name + available username + ≥3 chars
- [ ] Color picker step shows preview avatar updating in real time
- [ ] Bio step is skippable
- [ ] Interests step requires at least 1 selection
- [ ] Confetti completion screen redirects to /(tabs)/discover
- [ ] First-Echo coach card visible above feed, dismissible via × button
- [ ] Coach disappears after first publish (refresh to confirm)

## 2. Auth flows

- [ ] Email signup creates account
- [ ] Email login with wrong password → red error, spinner stops
- [ ] Email login with correct password → /(tabs)/discover within 2s
- [ ] Forgot Password → email arrives → tap link opens reset-password screen, not Safari
- [ ] Reset password → success → can sign in with new password
- [ ] Phone signup → SMS OTP → verify → /(tabs)/discover
- [ ] Sign in with Google → consent screen in Safari Auth Session → returns to app signed in
- [ ] Sign in with Apple → native sheet → returns to app signed in
- [ ] Sign out → cleared session → /auth/login (cannot navigate back into tabs)
- [ ] Re-sign-in after sign-out → no stale data on Home

## 3. Compose flow

- [ ] Tap compose CTA → create-post opens
- [ ] Type @ in response → autocomplete dropdown appears, debounced, max 6 results
- [ ] Tap a suggestion → @username inserted with trailing space
- [ ] Add a co-author → second response field appears
- [ ] Add a poll → 2 options minimum, 4 maximum, duration picker functional
- [ ] Add a photo → image picker → up to 4 photos
- [ ] Add a video → picker → preview plays
- [ ] Tap Post → ceremony overlay → "Echo sent." → first-echo push pre-prompt appears
- [ ] Tap "Turn on notifications" → iOS native prompt fires
- [ ] Tap "Not now" → no iOS prompt, redirected to Home
- [ ] Echo appears at top of feed within 2 seconds
- [ ] Tap echo → /thread opens with full content

## 4. Feed + reactions

- [ ] Pull-to-refresh works on Home
- [ ] Scrolling holds 60fps (visual smoothness check) on iPhone 12 with 30+ items
- [ ] "For You" / "Trending" / "Following" pills change active state and reload
- [ ] Realtime banner appears when another user publishes (test with 2 sessions)
- [ ] Reactions pile shows 🤯 📝 💯 🤔 with counts
- [ ] Tap a reaction → count increments optimistically; refresh confirms persistence
- [ ] Tap again → toggles off
- [ ] Long-press a card → "Show less / Mute @user / Not interested" sheet
- [ ] Three-dot menu → "View profile / Mute / Report"
- [ ] Like button → fills red + count bumps
- [ ] Bookmark → icon fills accent
- [ ] Repost → success toast; tap again to undo
- [ ] Repost long-press → quote-repost flow opens compose with the quoted card

## 5. Comments

- [ ] Open thread → comments load
- [ ] Type comment → @ autocomplete works
- [ ] Send → comment appears immediately (optimistic)
- [ ] Tap "Reply" under a comment → indented reply composer appears with @ pre-fill
- [ ] Threaded replies render indented by 24-32px
- [ ] Like a comment → heart fills, count bumps
- [ ] Comment count on parent FeedCard updates

## 6. Direct messages

- [ ] Open Messages tab → conversations load (skeleton on first paint)
- [ ] Tap a conversation → messages screen
- [ ] Type + send → bubble appears at top of stack
- [ ] Typing indicator appears for the other user (test with two devices)
- [ ] Long-press a message → "Copy / Delete" sheet (own messages only)

## 7. Activity tab

- [ ] Notifications load on tab open (skeleton on first paint)
- [ ] Filter chips: All / Unread / Mentions / Replies / Reactions / Saves / Quotes / Likes / Follows / Reposts
- [ ] Grouped notifications collapse correctly ("X and 11 others reacted with 🤯")
- [ ] Long-press chat tab → ActionSheet with Open Messages / New conversation / Command palette
- [ ] Long-press activity tab → ActionSheet with Mark all read / Mute push toggle
- [ ] Tap a notification → routes to /thread (for likes/comments/etc.) or /user (for follow)
- [ ] Pull-to-refresh updates the list

## 8. Profile

- [ ] Self profile shows stats, bio, signature echo
- [ ] Tap Edit Profile → edit-profile screen → save → persists
- [ ] Other user profile loads
- [ ] Follow button → "Following" toggle + count bump
- [ ] Send DM button → opens /messages with that user
- [ ] Tap follower count → /followers screen

## 9. AI Chat

- [ ] Open Chat tab → empty state shows suggestions + AI disclosure line
- [ ] Send a message → streaming reply appears
- [ ] Long-press chat tab → command palette opens
- [ ] AI offers compose_post → confirm card → tap Confirm → echo publishes
- [ ] AI offers compose_poll → confirm card → poll publishes
- [ ] AI offers navigate_to → app routes to that screen
- [ ] Stop button mid-stream → stream halts; partial reply persists
- [ ] Session switcher (drawer) opens, allows switching + delete
- [ ] Model picker (Flash / Pro / Lite) → switch persists

## 10. Settings

- [ ] Edit theme → changes apply across screens
- [ ] Toggle dark mode → switches; persists across reload
- [ ] Font size picker → text scales
- [ ] Notification toggle → no crash even without push setup
- [ ] Privacy / Terms links open
- [ ] Sign Out works
- [ ] Delete Account → type DELETE → button enables → tap → returns to login

## 11. Permissions (decline path)

- [ ] Decline camera permission → friendly error, no crash
- [ ] Decline photo library → friendly error
- [ ] Decline microphone (recording memo) → friendly error
- [ ] Decline push (initial pre-prompt OR native prompt) → app fully functional, no nags

## 12. Offline / poor network

- [ ] Toggle airplane mode → app continues with cached feed
- [ ] Pull-to-refresh while offline → friendly retry; no crash
- [ ] Send echo while offline → graceful error, no data loss
- [ ] Toggle online → next refresh works

## 13. Edge cases

- [ ] Tap a Universal Link `https://echo.app/e/<id>` from Mail → opens app to thread
- [ ] Tap a Universal Link `https://echo.app/u/<id>` from Mail → opens user profile
- [ ] App in background → push arrives → tap notification → routes correctly
- [ ] App killed → tap notification → cold-start to correct screen
- [ ] V2 features (Salons / Office Hours / Quests / Badges / Year in Echo) are not reachable via UI
- [ ] Deep-linking to a hidden v2 route → redirects to Home

## 14. Performance

- [ ] Cold start under 3s on iPhone 15 Pro Max
- [ ] Cold start under 4s on iPhone SE 3rd gen
- [ ] Feed scroll holds 60fps on iPhone 12 with 30+ items
- [ ] No red error overlays in normal use
- [ ] Memory stays under 250 MB during a full session (Xcode Instruments)

## 15. App Store metadata

- [ ] Bundle ID matches App Store Connect record
- [ ] Build number incremented from previous TestFlight
- [ ] Privacy nutrition label data types match `docs/app-store-listing.md`
- [ ] Demo account credentials work for App Review
- [ ] Privacy Policy URL is live
- [ ] Support URL is live
- [ ] Screenshots reflect current UI (re-shoot after any theme change)

---

## Sign-off

| Tester | Device | iOS | Date | Result |
| --- | --- | --- | --- | --- |
| | | | | |
| | | | | |
