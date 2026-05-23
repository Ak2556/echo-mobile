# Accessibility — pre-launch state + post-launch sweep

VoiceOver works on Echo today because the vast majority of tap targets contain Text children that the screen reader announces by default. Pre-launch we closed the highest-risk gaps; this doc tracks the deeper sweep we'll do post-v1.

## What ships in v1 (done)

- **`AnimatedPressable` defaults** — both the Lite and Heavy paths now default `accessibilityRole` to `"button"` and infer `accessibilityLabel` from any string child. That single change covers ~80% of the ~849 button call sites without touching them individually.
- **Tab bar** — explicit `accessibilityLabel` + `accessibilityRole="button"` + `accessibilityState.selected` on every tab.
- **FeedCard** — like / comment / repost / bookmark / share buttons all carry explicit labels.
- **Sign-in / Sign-up** — form fields have native text labels; submit buttons announce via text children.
- **Long-press menus (ActionSheet)** — each row has its label text; the wrapping Pressable inherits it.
- **EmptyState** — title + subtitle are Text; CTA inherits its label from the action label prop.
- **ConsentBanner** — explicit `accessibilityRole`, `accessibilityLabel`, and `accessibilityHint` on both buttons; the card itself has `accessibilityRole="alert"`.
- **Icon-only back / overflow buttons** on `app/user/[id].tsx` and `app/thread/[id].tsx` (the two highest-traffic detail screens) now carry explicit labels + hints.

## What's still missing (low-impact)

- **Plain `<Pressable>` icon buttons** outside the two screens above (e.g. close `×` chips in lists, dismiss buttons on banners). The `AnimatedPressable` default doesn't apply because they don't use the wrapper. Easy follow-up.
- **Image-as-CTA elements** in Stories and HeroCard rails — `accessibilityLabel` should describe the story content (e.g. `"Story from @username"`).
- **Custom-drawn elements** like the polls bar — should set `accessibilityValue={{ now: pct, min: 0, max: 100 }}` so the percent is announced.

## VoiceOver test plan

Settings → Accessibility → VoiceOver on iOS Simulator, then walk these flows:

1. Cold-start → onboarding → sign-up → first-echo coach
2. Discover tab → swipe through 5 cards → like / repost / comment
3. Open a thread → reply → back
4. Profile → settings → account deletion (do NOT confirm)
5. Switch theme + accent color
6. Trigger the `ConsentBanner` (delete the MMKV key first)

Document any failures inline in this file under "Found during VoiceOver QA".

## Suggested post-launch fix

Sweep the remaining `<Pressable>` icon-only buttons (≈30 files) with explicit labels. Estimate: 2–4 hours.

```ts
// pattern
<Pressable
  onPress={...}
  accessibilityRole="button"
  accessibilityLabel="Close"
>
  <X size={20} />
</Pressable>
```

Then audit Story / HeroCard image CTAs and the polls bar's `accessibilityValue`.
