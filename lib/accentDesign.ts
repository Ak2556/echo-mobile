// Accent design tokens layered on top of the existing theme.

import type { ViewStyle, TextStyle } from 'react-native';
import { Platform } from 'react-native';

// Palette
// Muted editorial tones that sit alongside the brand orange (#E06030)
// instead of fighting it. Keys are kept stable for existing consumers.
export const ACCENT_COLORS = {
  cyan:    '#7FB0BC',
  cyanDim: 'rgba(127,176,188,0.18)',
  magenta: '#C1789A',
  magentaDim: 'rgba(193,120,154,0.18)',
  lime:    '#A3B26E',
  limeDim: 'rgba(163,178,110,0.18)',
  violet:  '#9789BD',
  violetDim: 'rgba(151,137,189,0.18)',
  amber:   '#D19A54',
  amberDim: 'rgba(209,154,84,0.18)',
} as const;

// Use as `colors` for expo-linear-gradient. Warm, near-brand blends —
// no rainbow stops.
export const GRADIENTS = {
  remix:    ['#E8834E', '#D95F2B'] as const,
  evolutions: ['#D95F2B', '#C98A3F'] as const,
  forYou:   ['#DFA153', '#D96A35'] as const,
  achievement: ['#C98A3F', '#D96A35'] as const,
  heroOverlay: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'] as const,
} as const;

// Neutral depth shadow. Colored glows read as template chrome, so the
// `color` argument is accepted for API compatibility but ignored.
export function accentShadow(_color: string, intensity: 'soft' | 'med' | 'hard' = 'med'): ViewStyle {
  if (Platform.OS === 'android') {
    return { elevation: intensity === 'hard' ? 8 : intensity === 'med' ? 5 : 3 };
  }
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: intensity === 'hard' ? 6 : 3 },
    shadowOpacity: intensity === 'hard' ? 0.35 : intensity === 'med' ? 0.25 : 0.15,
    shadowRadius: intensity === 'hard' ? 16 : intensity === 'med' ? 10 : 6,
  };
}

// Typography presets
// Display type presets for high-emphasis surfaces.
export const DISPLAY_TYPE = {
  hero:    { fontSize: 44, lineHeight: 48, fontWeight: '900' as const, letterSpacing: 0 },
  display: { fontSize: 34, lineHeight: 38, fontWeight: '900' as const, letterSpacing: 0 },
  title:   { fontSize: 26, lineHeight: 30, fontWeight: '800' as const, letterSpacing: 0 },
  eyebrow: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 2.5, textTransform: 'uppercase' as const },
  stat:    { fontSize: 28, fontWeight: '900' as const, fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
} satisfies Record<string, TextStyle>;

// Spring configs
// Interaction springs for high-emphasis actions.
export const ACCENT_SPRING = {
  press:    { damping: 14, stiffness: 700, mass: 0.6 },
  pop:      { damping: 9,  stiffness: 380, mass: 0.7 },
  pulse:    { damping: 6,  stiffness: 220, mass: 1.0 },
  release:  { damping: 22, stiffness: 380, mass: 0.8 },
} as const;

// Haptic patterns
// Centralized so we can tune the whole app's "feel" in one place. Imports
// `expo-haptics` lazily to avoid pulling it into bundles that don't use it.
export type HapticIntensity = 'tap' | 'select' | 'success' | 'remix' | 'celebrate';

export async function feedbackHaptic(intensity: HapticIntensity): Promise<void> {
  try {
    const H = await import('expo-haptics');
    switch (intensity) {
      case 'tap':       return H.impactAsync(H.ImpactFeedbackStyle.Light);
      case 'select':    return H.selectionAsync();
      case 'success':   return H.notificationAsync(H.NotificationFeedbackType.Success);
      case 'remix':
        await H.impactAsync(H.ImpactFeedbackStyle.Medium);
        await new Promise(r => setTimeout(r, 70));
        return H.impactAsync(H.ImpactFeedbackStyle.Heavy);
      case 'celebrate':
        await H.impactAsync(H.ImpactFeedbackStyle.Light);
        await new Promise(r => setTimeout(r, 60));
        await H.impactAsync(H.ImpactFeedbackStyle.Medium);
        await new Promise(r => setTimeout(r, 80));
        return H.notificationAsync(H.NotificationFeedbackType.Success);
    }
  } catch {
    // Haptics aren't available on web / unsupported devices — silently skip.
  }
}

// Pill / chip preset
// Shared pill/chip layout.
export const ACCENT_CHIP: ViewStyle = {
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderRadius: 999,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  alignSelf: 'flex-start',
};
