// Accent design tokens layered on top of the existing theme for newer
// surfaces such as Remix, Evolutions, and For You.
//
// Use these tokens in any NEW component. Do not retrofit existing screens
// here — that's a separate visual-refresh epic.

import type { ViewStyle, TextStyle } from 'react-native';
import { Platform } from 'react-native';

// ── Palette ──────────────────────────────────────────────────────────────────
// Neon stops tuned for AMOLED / dark mode. Each accent has matching glow
// and a translucent tint for backgrounds.
export const NEON = {
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

// ── Signature gradients ──────────────────────────────────────────────────────
// Use as `colors` for expo-linear-gradient.
export const GRADIENTS = {
  // Remix: cyan → violet → magenta. Reads as "branching / energy".
  remix:    ['#22F5FF', '#7A4DFF', '#FF3DD8'] as const,
  // Evolutions: magenta → amber → lime. Reads as "growth across versions".
  evolutions: ['#FF3DD8', '#FFB12B', '#C6FF3D'] as const,
  // For You: violet → cyan → lime. Reads as "personalized / fresh".
  forYou:   ['#9B5BFF', '#22F5FF', '#C6FF3D'] as const,
  // Achievement: lime → cyan. Used for streaks + XP chips.
  achievement: ['#C6FF3D', '#22F5FF'] as const,
  // Hero overlay: top-to-bottom dark fade for stacking text on imagery.
  heroOverlay: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'] as const,
} as const;

// ── Glow shadow presets ──────────────────────────────────────────────────────
// iOS only — Android doesn't render colored shadows the same way; we fall
// back to a stronger elevation there.
export function neonGlow(color: string, intensity: 'soft' | 'med' | 'hard' = 'med'): ViewStyle {
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

// ── Typography presets ───────────────────────────────────────────────────────
// Oversized expressive type for hero moments. Pair with `numberOfLines={2}`
// so long titles wrap instead of truncating awkwardly.
export const TYPE = {
  hero:    { fontSize: 44, lineHeight: 48, fontWeight: '900' as const, letterSpacing: 0 },
  display: { fontSize: 34, lineHeight: 38, fontWeight: '900' as const, letterSpacing: 0 },
  title:   { fontSize: 26, lineHeight: 30, fontWeight: '800' as const, letterSpacing: 0 },
  // Eyebrow — small all-caps label above hero text. Use sparingly.
  eyebrow: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 2.5, textTransform: 'uppercase' as const },
  // Numeric stats — Tabular figures so columns line up.
  stat:    { fontSize: 28, fontWeight: '900' as const, fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
} satisfies Record<string, TextStyle>;

// ── Spring configs ───────────────────────────────────────────────────────────
// Interaction springs for high-emphasis actions.
export const NEON_SPRING = {
  press:    { damping: 14, stiffness: 700, mass: 0.6 },
  pop:      { damping: 9,  stiffness: 380, mass: 0.7 },  // celebration pop
  pulse:    { damping: 6,  stiffness: 220, mass: 1.0 },  // breathing pulse
  release:  { damping: 22, stiffness: 380, mass: 0.8 },
} as const;

// ── Haptic patterns ──────────────────────────────────────────────────────────
// Centralized so we can tune the whole app's "feel" in one place. Imports
// `expo-haptics` lazily to avoid pulling it into bundles that don't use it.
export type HapticIntensity = 'tap' | 'select' | 'success' | 'remix' | 'celebrate';

export async function neonHaptic(intensity: HapticIntensity): Promise<void> {
  try {
    const H = await import('expo-haptics');
    switch (intensity) {
      case 'tap':       return H.impactAsync(H.ImpactFeedbackStyle.Light);
      case 'select':    return H.selectionAsync();
      case 'success':   return H.notificationAsync(H.NotificationFeedbackType.Success);
      case 'remix':
        // Double-thump: distinctive cue that something forked.
        await H.impactAsync(H.ImpactFeedbackStyle.Medium);
        await new Promise(r => setTimeout(r, 70));
        return H.impactAsync(H.ImpactFeedbackStyle.Heavy);
      case 'celebrate':
        // Triple-rising: signature publish/achievement feel.
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

// ── Pill / chip preset ───────────────────────────────────────────────────────
// Used by lineage chips, stat chips, "hot" badges, etc.
export const NEON_CHIP: ViewStyle = {
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderRadius: 999,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  alignSelf: 'flex-start',
};
