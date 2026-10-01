import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 2026-10-01 lag investigation (release build, emulator, gfxinfo + atrace).
describe('performance regressions', () => {
  it('the glass sheen does not follow the rotation sensor', () => {
    // Every GlassPanel subscribed at 16 ms and started two springs per reading:
    // Settings drew 241 frames in 8 s at idle and 98% of scroll frames janked.
    const src = readFileSync('components/ui/DynamicReflection.tsx', 'utf8');
    expect(src).not.toMatch(/useAnimatedSensor|withSpring|useAnimatedStyle/);
  });

  it('the floating bubble glides instead of bouncing', () => {
    const src = readFileSync('components/mini-apps/FloatingMiniApp.tsx', 'utf8');
    expect(src).toMatch(/tx\.value = withTiming\(startX, BUBBLE_GLIDE\);/);
    expect(src).toMatch(/ty\.value = withTiming\(startY, BUBBLE_GLIDE\);/);
    expect(src).toMatch(/tx\.value = withTiming\(snapX, BUBBLE_GLIDE\);/);
  });
});

describe('no live blur per list row', () => {
  it('feed card action buttons are static GlassChips, not LiquidGlass', () => {
    // ~46 live blur views (one per button) made Home janky on 72-99% of frames.
    const card = readFileSync('src/features/feed/ui/FeedCard.tsx', 'utf8');
    expect(card).toMatch(/<GlassChip\s/);
    expect(card).not.toMatch(/<LiquidGlass/);
  });

  it('GlassChip never mounts a BlurView or a Skia surface', () => {
    const chip = readFileSync('components/ui/GlassChip.tsx', 'utf8');
    expect(chip).not.toMatch(/from 'expo-blur'|react-native-skia|<LiquidGlass|<GlassPanel/);
  });
});

describe('pressable layout', () => {
  it('an animated pressable with no size does not stretch its box', () => {
    // A `flex: 1` box inside an unsized animated touchable stretched Dice's
    // Roll and Flip buttons to ~12,000px and hid the rest of the screen.
    const src = readFileSync('components/ui/AnimatedPressable.tsx', 'utf8');
    const heavy = src.slice(src.indexOf('function HeavyPressable'));
    expect(heavy).toMatch(/<View style=\{\[inner, fillFor\(outer\)\]\}>/);
    expect(heavy).not.toMatch(/<View style=\{\[inner, styles\.fill\]\}>/);
  });
});

describe('voice memo playback', () => {
  it('the player listener is only removed on unmount', () => {
    // The cleanup depended on [sound]; setSound() in playMemo ran it and
    // removed the listener just attached, so a finished memo showed Pause.
    const src = readFileSync('app/mini-apps/voice-memo.tsx', 'utf8');
    expect(src).not.toMatch(/playbackSubscriptionRef\.current\?\.remove\(\);\s*sound\?\.remove\(\);[\s\S]{0,120}\}, \[sound\]\);/);
    expect(src).toMatch(/useEffect\(\(\) => \(\) => \{\s*playbackSubscriptionRef\.current\?\.remove\(\);[\s\S]*?\}, \[\]\);/);
  });
});
