// Accent design tokens layered on top of the existing theme.

import type { ViewStyle, TextStyle } from 'react-native';
import { Platform } from 'react-native';

// Palette
// High-contrast color stops for dark-mode surfaces.
export const ACCENT_COLORS = {
  cyan:    '#22F5FF',
  cyanDim: 'rgba(34,245,255,0.22)',
  magenta: '#FF3DD8',
  magentaDim: 'rgba(255,61,216,0.22)',
  lime:    '#C6FF3D',
  limeDim: 'rgba(198,255,61,0.22)',
  violet:  '#9B5BFF',
  violetDim: 'rgba(155,91,255,0.22)',
  amber:   '#FFB12B',
  amberDim: 'rgba(255,177,43,0.22)',
} as const;

// Use as `colors` for expo-linear-gradient.
export const GRADIENTS = {
  remix:    ['#22F5FF', '#7A4DFF', '#FF3DD8'] as const,
  evolutions: ['#FF3DD8', '#FFB12B', '#C6FF3D'] as const,
  forYou:   ['#9B5BFF', '#22F5FF', '#C6FF3D'] as const,
  achievement: ['#C6FF3D', '#22F5FF'] as const,
  heroOverlay: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'] as const,
} as const;

// iOS only — Android doesn't render colored shadows the same way; we fall
// back to a stronger elevation there.
export function accentShadow(color: string, intensity: 'soft' | 'med' | 'hard' = 'med'): ViewStyle {
  const opacity = intensity === 'soft' ? 0.35 : intensity === 'hard' ? 0.85 : 0.55;
  const radius  = intensity === 'soft' ? 14   : intensity === 'hard' ? 28   : 20;
  if (Platform.OS === 'android') {
    return { elevation: intensity === 'hard' ? 12 : intensity === 'med' ? 8 : 4 };
  }
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: opacity,
    shadowRadius: radius,
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
