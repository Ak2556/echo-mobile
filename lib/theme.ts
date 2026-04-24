import { useAppStore } from '../store/useAppStore';

// ── Theme Definitions ──

export type ThemeName = 'midnight' | 'amoled' | 'ocean' | 'sunset' | 'forest' | 'lavender';

export interface ThemeColors {
  name: string;
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
  glassFill?: string;
  glassBorder?: string;
  glassHighlight?: string;
}

const THEMES: Record<ThemeName, ThemeColors> = {
  midnight: {
    name: 'Midnight',
    bg: '#09090B',
    bgPure: '#000000',
    surface: '#18181B',
    surfaceHover: '#27272A',
    border: '#27272A',
    text: '#FFFFFF',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    accent: '#3B82F6',
    accentMuted: 'rgba(59,130,246,0.15)',
    danger: '#EF4444',
    dangerMuted: 'rgba(239,68,68,0.15)',
    success: '#22C55E',
    tabBar: '#000000',
    tabBorder: '#1C1C1E',
    inputBg: '#18181B',
    inputBorder: '#27272A',
  },
  amoled: {
    name: 'AMOLED',
    bg: '#000000',
    bgPure: '#000000',
    surface: '#0A0A0A',
    surfaceHover: '#141414',
    border: '#1A1A1A',
    text: '#FFFFFF',
    textSecondary: '#999999',
    textMuted: '#666666',
    accent: '#3B82F6',
    accentMuted: 'rgba(59,130,246,0.12)',
    danger: '#EF4444',
    dangerMuted: 'rgba(239,68,68,0.12)',
    success: '#22C55E',
    tabBar: '#000000',
    tabBorder: '#111111',
    inputBg: '#0A0A0A',
    inputBorder: '#1A1A1A',
  },
  ocean: {
    name: 'Ocean',
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
  },
  sunset: {
    name: 'Sunset',
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
  },
  forest: {
    name: 'Forest',
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
  },
  lavender: {
    name: 'Lavender',
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
  },
};

// ── Font Size Maps ──

const FONT_SIZE_MAP = {
  small:  { caption: 10, small: 12, body: 14, title: 18, heading: 24 },
  medium: { caption: 11, small: 13, body: 16, title: 20, heading: 28 },
  large:  { caption: 12, small: 14, body: 18, title: 22, heading: 32 },
} as const;

// ── Border Radius Maps ──

const RADIUS_MAP = {
  small:  { sm: 4, md: 8, lg: 12, xl: 14, card: 12, full: 9999 },
  medium: { sm: 8, md: 12, lg: 16, xl: 20, card: 16, full: 9999 },
  large:  { sm: 12, md: 16, lg: 20, xl: 24, card: 24, full: 9999 },
} as const;

// ── Mock online users (subset of mock user IDs) ──

const ONLINE_USER_IDS = new Set(['u1', 'u4', 'u5', 'u7']);

// ── useTheme Hook ──

export function useTheme() {
  const themeName = useAppStore(s => s.theme);
  const accentColor = useAppStore(s => s.accentColor);
  const pureBlackBg = useAppStore(s => s.pureBlackBackground);
  const fontSize = useAppStore(s => s.fontSize);
  const reduceAnimations = useAppStore(s => s.reduceAnimations);
  const showAvatars = useAppStore(s => s.showAvatars);
  const roundedCorners = useAppStore(s => s.roundedCorners);
  const onlineStatus = useAppStore(s => s.onlineStatus);

  const base = THEMES[themeName] || THEMES.midnight;

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
    accentMuted: hexToRgba(accentColor || base.accent, 0.15),
    bg: pureBlackBg ? base.bgPure : base.bg,
    glassFill: 'rgba(255,255,255,0.07)',
    glassBorder: 'rgba(255,255,255,0.13)',
    glassHighlight: 'rgba(255,255,255,0.09)',
  };

  const fontSizes = FONT_SIZE_MAP[fontSize] || FONT_SIZE_MAP.medium;
  const radius = RADIUS_MAP[roundedCorners] || RADIUS_MAP.medium;

  const animation = <T>(anim: T): T | undefined => {
    return reduceAnimations ? undefined : anim;
  };

  const switchTrack = { false: colors.surfaceHover, true: colors.accent };

  const isUserOnline = (userId: string): boolean => {
    return onlineStatus && ONLINE_USER_IDS.has(userId);
  };

  return {
    colors,
    fontSizes,
    radius,
    animation,
    switchTrack,
    reduceAnimations,
    showAvatars,
    isUserOnline,
  };
}

export { THEMES };
export type { ThemeName as ThemeNameType };
