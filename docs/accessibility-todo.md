# Accessibility — post-launch sweep

VoiceOver works on Echo today because the vast majority of tap targets contain Text children that the screen reader announces by default. The launch-blocking gaps are minimal. This doc tracks the deeper sweep we do post-v1.

## Current state

- **Tab bar:** explicit `accessibilityLabel` + `accessibilityRole="button"` + `accessibilityState.selected` on every tab.
- **FeedCard:** like/comment/repost/bookmark/share buttons all carry explicit labels.
- **Sign-in / Sign-up:** form fields have native text labels; submit buttons announce via text children.
- **Long-press menus (ActionSheet):** each row has its label text; the wrapping Pressable inherits it.
- **EmptyState:** title + subtitle are Text; CTA inherits its label from the action label prop.

## What's missing (low-impact)

- **Icon-only buttons** outside FeedCard (e.g. close `×` chips in lists, three-dot menus, dismiss buttons on banners). VoiceOver announces them as "button" with no context.
- **Image-as-CTA elements** in Stories and HeroCard rails — `accessibilityLabel` should describe the story content.
- **Custom-drawn elements** like the polls bar — `accessibilityValue` should announce percent.
- **AccessibilityRole** is rarely set explicitly. The default Pressable role is "none"; we should bump to "button" by default in AnimatedPressable so VoiceOver navigation skips through tap targets correctly.

## Suggested post-launch fix

Modify `components/ui/AnimatedPressable.tsx` to default `accessibilityRole` to `'button'` and to extract `accessibilityLabel` from string children when none was passed. That single change covers ~80% of the gaps without touching the 849 call sites.

```ts
const inferredLabel =
  props.accessibilityLabel ??
  (typeof children === 'string' ? children :
   typeof (children as any)?.props?.children === 'string' ? (children as any).props.children :
   undefined);

<Pressable
  accessibilityRole={props.accessibilityRole ?? 'button'}
  accessibilityLabel={inferredLabel}
  ...
/>
```

Then do a target sweep on:

- Icon-only `×` dismiss buttons
- Three-dot menu triggers (`DotsThreeOutline`)
- Avatar tap targets (label as `"@username profile"`)
- Story thumbnails (label as `"Story from @username"`)
- Poll option bars (`accessibilityValue={{ now: pct, min: 0, max: 100 }}`)

Plan: 4-6 hours of focused work post-launch.
