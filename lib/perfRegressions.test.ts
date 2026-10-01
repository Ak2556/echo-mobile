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
