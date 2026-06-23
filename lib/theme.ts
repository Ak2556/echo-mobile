import { useAppStore } from '../store/useAppStore';

// Global animation speed constants. Import ANIM in components instead of
// hardcoding durations or spring configs.
export const ANIM = {
  duration: 80,
  durationFast: 60,
  springSnappy: { damping: 22, stiffness: 600, mass: 0.8 },
  springPress:  { damping: 18, stiffness: 500 },
  springBadge:  { damping: 22, stiffness: 600 },
} as const;

// Theme Definitions
export type ThemeName = 'midnight' | 'amoled' | 'ocean' | 'sunset' | 'forest' | 'lavender' | 'light' | 'sepia' | 'arctic';

export interface ThemeColors {
  name: string;
  isDark: boolean;
  bg: string;
  bgPure: string;
  surface: string;
  surfaceHover: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
  danger: string;
  dangerMuted: string;
  success: string;
  tabBar: string;
  tabBorder: string;
  inputBg: string;
  inputBorder: string;
  glassFill: string;
  glassBorder: string;
  glassHighlight: string;
  glassHeavyFill: string;
  glassLightFill: string;
  /** Two-stop ambient gradient [accentTint, bg] for screen backgrounds */
  ambientGradient: readonly [string, string];
}

const DARK_GLASS = {
  glassFill:      'rgba(255,255,255,0.04)',
  glassBorder:    'rgba(255,255,255,0.18)',
  glassHighlight: 'rgba(255,255,255,0.14)',
  glassHeavyFill: 'rgba(255,255,255,0.08)',
  glassLightFill: 'rgba(255,255,255,0.02)',
} as const;

const THEMES: Record<ThemeName, ThemeColors> = {
  midnight: {
    name: 'Midnight',
    isDark: true,
    bg: '#0D0F14',
    bgPure: '#000000',
    surface: '#171A21',
    surfaceHover: '#20242D',
    border: '#2A2F3A',
    text: '#F7F8FA',
    textSecondary: '#B8C0CC',
    textMuted: '#7E8794',
    accent: '#4F8CFF',
    accentMuted: 'rgba(79,140,255,0.15)',
    danger: '#EF4444',
    dangerMuted: 'rgba(239,68,68,0.15)',
    success: '#22C55E',
    tabBar: '#101319',
    tabBorder: '#252A34',
    inputBg: '#171A21',
    inputBorder: '#2A2F3A',
    ambientGradient: ['rgba(79,140,255,0.16)', '#0D0F14'] as const,
    ...DARK_GLASS,
  },
  amoled: {
    name: 'AMOLED',
    isDark: true,
    bg: '#000000',
    bgPure: '#000000',
    surface: '#0A0A0A',
    surfaceHover: '#141414',
    border: '#1A1A1A',
    text: '#FFFFFF',
    textSecondary: '#999999',
    textMuted: '#666666',
    accent: '#4F8CFF',
    accentMuted: 'rgba(79,140,255,0.12)',
    danger: '#EF4444',
    dangerMuted: 'rgba(239,68,68,0.12)',
    success: '#22C55E',
    tabBar: '#000000',
    tabBorder: '#111111',
    inputBg: '#0A0A0A',
    inputBorder: '#1A1A1A',
    ambientGradient: ['rgba(79,140,255,0.16)', '#000000'] as const,
    ...DARK_GLASS,
  },
  ocean: {
    name: 'Ocean',
    isDark: true,
    bg: '#0B1120',
    bgPure: '#000000',
    surface: '#111B2E',
    surfaceHover: '#182742',
    border: '#1E3050',
    text: '#E8EDF5',
    textSecondary: '#8BA3C7',
    textMuted: '#5A7BA5',
    accent: '#38BDF8',
    accentMuted: 'rgba(56,189,248,0.15)',
    danger: '#F87171',
    dangerMuted: 'rgba(248,113,113,0.15)',
    success: '#34D399',
    tabBar: '#070D18',
    tabBorder: '#152035',
    inputBg: '#111B2E',
    inputBorder: '#1E3050',
    ambientGradient: ['rgba(56,189,248,0.30)', '#0B1120'] as const,
    ...DARK_GLASS,
  },
  sunset: {
    name: 'Sunset',
    isDark: true,
    bg: '#1A0E0A',
    bgPure: '#000000',
    surface: '#261510',
    surfaceHover: '#331C14',
    border: '#3D2318',
    text: '#FFF0E8',
    textSecondary: '#C4A08A',
    textMuted: '#8A6B55',
    accent: '#F97316',
    accentMuted: 'rgba(249,115,22,0.15)',
    danger: '#EF4444',
    dangerMuted: 'rgba(239,68,68,0.15)',
    success: '#22C55E',
    tabBar: '#120A07',
    tabBorder: '#2D1A12',
    inputBg: '#261510',
    inputBorder: '#3D2318',
    ambientGradient: ['rgba(249,115,22,0.32)', '#1A0E0A'] as const,
    ...DARK_GLASS,
  },
  forest: {
    name: 'Forest',
    isDark: true,
    bg: '#0A1410',
    bgPure: '#000000',
    surface: '#101F18',
    surfaceHover: '#162A20',
    border: '#1C3528',
    text: '#E8F5EF',
    textSecondary: '#8AC4A0',
    textMuted: '#5A8A6E',
    accent: '#10B981',
    accentMuted: 'rgba(16,185,129,0.15)',
    danger: '#F87171',
    dangerMuted: 'rgba(248,113,113,0.15)',
    success: '#34D399',
    tabBar: '#071009',
    tabBorder: '#142B1E',
    inputBg: '#101F18',
    inputBorder: '#1C3528',
    ambientGradient: ['rgba(16,185,129,0.30)', '#0A1410'] as const,
    ...DARK_GLASS,
  },
  lavender: {
    name: 'Lavender',
    isDark: true,
    bg: '#100E1A',
    bgPure: '#000000',
    surface: '#1A1726',
    surfaceHover: '#232033',
    border: '#2D2842',
    text: '#F0EBF8',
    textSecondary: '#A89EC4',
    textMuted: '#756B8A',
    accent: '#A78BFA',
    accentMuted: 'rgba(167,139,250,0.15)',
    danger: '#F87171',
    dangerMuted: 'rgba(248,113,113,0.15)',
    success: '#34D399',
    tabBar: '#0A0812',
    tabBorder: '#211E32',
    inputBg: '#1A1726',
    inputBorder: '#2D2842',
    ambientGradient: ['rgba(167,139,250,0.32)', '#100E1A'] as const,
    ...DARK_GLASS,
  },

  // Light themes
  light: {
    name: 'Light',
    isDark: false,
    bg: '#F6F7FA',
    bgPure: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceHover: '#EEF1F6',
    border: '#DDE2EA',
    text: '#111827',
    textSecondary: '#5D6675',
    textMuted: '#8A94A3',
    accent: '#3F7DF6',
    accentMuted: 'rgba(63,125,246,0.12)',
    danger: '#EF4444',
    dangerMuted: 'rgba(239,68,68,0.12)',
    success: '#16A34A',
    tabBar: '#FFFFFF',
    tabBorder: '#DDE2EA',
    inputBg: '#FFFFFF',
    inputBorder: '#DDE2EA',
    glassFill:      'rgba(255,255,255,0.30)',
    glassBorder:    'rgba(0,0,0,0.10)',
    glassHighlight: 'rgba(255,255,255,1.0)',
    glassHeavyFill: 'rgba(255,255,255,0.44)',
    glassLightFill: 'rgba(255,255,255,0.18)',
    ambientGradient: ['rgba(63,125,246,0.16)', '#F6F7FA'] as const,
  },
  sepia: {
    name: 'Sepia',
    isDark: false,
    bg: '#F5ECD7',
    bgPure: '#FEF9EE',
    surface: '#FEF9EE',
    surfaceHover: '#EDE0C8',
    border: '#D9C8AA',
    text: '#2C1810',
    textSecondary: '#7A5C40',
    textMuted: '#A68B6B',
    accent: '#B45309',
    accentMuted: 'rgba(180,83,9,0.12)',
    danger: '#DC2626',
    dangerMuted: 'rgba(220,38,38,0.12)',
    success: '#15803D',
    tabBar: '#FEF9EE',
    tabBorder: '#D9C8AA',
    inputBg: '#FEF9EE',
    inputBorder: '#D9C8AA',
    glassFill:      'rgba(254,249,238,0.30)',
    glassBorder:    'rgba(44,24,16,0.12)',
    glassHighlight: 'rgba(255,255,255,0.95)',
    glassHeavyFill: 'rgba(254,249,238,0.44)',
    glassLightFill: 'rgba(254,249,238,0.18)',
    ambientGradient: ['rgba(180,83,9,0.22)', '#F5ECD7'] as const,
  },
  arctic: {
    name: 'Arctic',
    isDark: false,
    bg: '#EFF6FF',
    bgPure: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceHover: '#DBEAFE',
    border: '#BFDBFE',
    text: '#0C1B2E',
    textSecondary: '#3B6080',
    textMuted: '#6B92B8',
    accent: '#0284C7',
    accentMuted: 'rgba(2,132,199,0.12)',
    danger: '#DC2626',
    dangerMuted: 'rgba(220,38,38,0.12)',
    success: '#15803D',
    tabBar: '#FFFFFF',
    tabBorder: '#BFDBFE',
    inputBg: '#FFFFFF',
    inputBorder: '#BFDBFE',
    glassFill:      'rgba(255,255,255,0.30)',
    glassBorder:    'rgba(12,27,46,0.10)',
    glassHighlight: 'rgba(255,255,255,1.0)',
    glassHeavyFill: 'rgba(255,255,255,0.44)',
    glassLightFill: 'rgba(255,255,255,0.18)',
    ambientGradient: ['rgba(2,132,199,0.22)', '#EFF6FF'] as const,
  },
};

// Font Size Maps
const FONT_SIZE_MAP = {
  small:  { caption: 10, small: 12, body: 14, title: 18, heading: 24 },
  medium: { caption: 11, small: 13, body: 16, title: 20, heading: 28 },
  large:  { caption: 12, small: 14, body: 18, title: 22, heading: 32 },
} as const;

const LINE_HEIGHT_MULTIPLIERS = {
  caption: 1.35,
  small: 1.45,
  body: 1.5,
  title: 1.3,
  heading: 1.22,
} as const;

// Border Radius Maps
const RADIUS_MAP = {
  small:  { sm: 4, md: 8, lg: 10, xl: 12, card: 10, full: 9999 },
  medium: { sm: 6, md: 10, lg: 14, xl: 18, card: 14, full: 9999 },
  large:  { sm: 8, md: 12, lg: 16, xl: 20, card: 18, full: 9999 },
} as const;

// Local online users
const ONLINE_USER_IDS = new Set(['u1', 'u4', 'u5', 'u7']);

// useTheme Hook
export function useTheme() {
  const themeName = useAppStore(s => s.theme);
  const darkMode = useAppStore(s => s.darkMode);
  const accentColor = useAppStore(s => s.accentColor);
  const pureBlackBg = useAppStore(s => s.pureBlackBackground);
  const fontSize = useAppStore(s => s.fontSize);
  const fontScale = useAppStore(s => s.fontScale);
  const reduceAnimations = useAppStore(s => s.reduceAnimations);
  const showAvatars = useAppStore(s => s.showAvatars);
  const roundedCorners = useAppStore(s => s.roundedCorners);
  const onlineStatus = useAppStore(s => s.onlineStatus);

  const selectedBase = THEMES[themeName] || THEMES.midnight;
  // darkMode=false forces the light theme when a dark theme is active
  const base = (!darkMode && selectedBase.isDark) ? THEMES.light : selectedBase;

  // Build accent muted from accentColor
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const colors: ThemeColors = {
    ...base,
    accent: accentColor || base.accent,
    accentMuted: hexToRgba(accentColor || base.accent, base.isDark ? 0.15 : 0.12),
    bg: (pureBlackBg && base.isDark) ? base.bgPure : base.bg,
  };

  const baseSizes = FONT_SIZE_MAP[fontSize] || FONT_SIZE_MAP.medium;
  const scale = typeof fontScale === 'number' && fontScale > 0 ? fontScale : 1;
  const fontSizes = scale === 1
    ? baseSizes
    : Object.fromEntries(Object.entries(baseSizes).map(([k, v]) => [k, Math.round((v as number) * scale)])) as typeof baseSizes;
  const lineHeights = Object.fromEntries(
    Object.entries(fontSizes).map(([k, v]) => {
      const key = k as keyof typeof LINE_HEIGHT_MULTIPLIERS;
      return [key, Math.round((v as number) * LINE_HEIGHT_MULTIPLIERS[key])];
    }),
  ) as Record<keyof typeof baseSizes, number>;
  const radius = RADIUS_MAP[roundedCorners] || RADIUS_MAP.medium;

  const animation = <T>(anim: T): T | undefined => {
    return reduceAnimations ? undefined : anim;
  };

  // Fast animation presets — use these instead of inline values.
  // All durations ≤80ms; springs settle in <120ms.

  const switchTrack = { false: colors.surfaceHover, true: colors.accent };

  const isUserOnline = (userId: string): boolean => {
    return onlineStatus && ONLINE_USER_IDS.has(userId);
  };

  const font = {
    body:         { fontFamily: 'Inter_400Regular' },
    bodyMedium:   { fontFamily: 'Inter_500Medium' },
    bodySemibold: { fontFamily: 'Inter_600SemiBold' },
    bodyBold:     { fontFamily: 'Inter_700Bold' },
    display:      { fontFamily: 'Inter_700Bold' as const, letterSpacing: 0 },
    displayBlack: { fontFamily: 'Inter_800ExtraBold' as const, letterSpacing: 0 },
    quote:        { fontFamily: 'Inter_400Regular' as const, fontStyle: 'italic' as const },
  };

  return {
    colors,
    fontSizes,
    lineHeights,
    radius,
    animation,
    switchTrack,
    reduceAnimations,
    showAvatars,
    isUserOnline,
    font,
  };
}

export { THEMES };
export type { ThemeName as ThemeNameType };
