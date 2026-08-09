import { useAppStore } from '../store/useAppStore';
import { usePresenceStore } from './presence';
import { buildFontPreset } from './fontPresets';



export const ANIM = {
  duration: 80,
  durationFast: 60,
  springSnappy: { damping: 22, stiffness: 600, mass: 0.8 },
  springPress:  { damping: 18, stiffness: 500 },
  springBadge:  { damping: 22, stiffness: 600 },
} as const;


export type ThemeName = 'midnight' | 'amoled' | 'tokyonight' | 'rosepine' | 'nord' | 'light' | 'tokyonight_day' | 'rosepine_dawn' | 'nord_light';

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
  warning: string;
  tabBar: string;
  tabBorder: string;
  inputBg: string;
  inputBorder: string;
  glassFill: string;
  glassBorder: string;
  glassHighlight: string;
  glassHeavyFill: string;
  glassLightFill: string;
    ambientGradient: readonly [string, string];
}

const THEMES: Record<ThemeName, ThemeColors> = {
  midnight: {
    name: 'Midnight',
    isDark: true,
    bg: '#09090B',
    bgPure: '#000000',
    surface: '#18181B',
    surfaceHover: '#27272A',
    border: '#3F3F46',
    text: '#FAFAFA',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    accent: '#FAFAFA',
    accentMuted: 'rgba(250,250,250,0.14)',
    danger: '#EF4444',
    dangerMuted: 'rgba(239,68,68,0.15)',
    success: '#22C55E',
    warning: '#F59E0B',
    tabBar: '#09090B',
    tabBorder: '#27272A',
    inputBg: '#18181B',
    inputBorder: '#3F3F46',
    ambientGradient: ['rgba(250,250,250,0.08)', '#09090B'] as const,
    glassFill: 'rgba(255,255,255,0.03)',
    glassBorder: 'rgba(255,255,255,0.12)',
    glassHighlight: 'rgba(255,255,255,0.10)',
    glassHeavyFill: 'rgba(255,255,255,0.08)',
    glassLightFill: 'rgba(255,255,255,0.01)',
  },
  amoled: {
    name: 'AMOLED',
    isDark: true,
    bg: '#000000',
    bgPure: '#000000',
    surface: '#09090B',
    surfaceHover: '#18181B',
    border: '#27272A',
    text: '#FFFFFF',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    accent: '#FFFFFF',
    accentMuted: 'rgba(255,255,255,0.12)',
    danger: '#EF4444',
    dangerMuted: 'rgba(239,68,68,0.12)',
    success: '#22C55E',
    warning: '#F59E0B',
    tabBar: '#000000',
    tabBorder: '#27272A',
    inputBg: '#09090B',
    inputBorder: '#27272A',
    ambientGradient: ['rgba(255,255,255,0.05)', '#000000'] as const,
    glassFill: 'rgba(255,255,255,0.02)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassHighlight: 'rgba(255,255,255,0.08)',
    glassHeavyFill: 'rgba(255,255,255,0.06)',
    glassLightFill: 'rgba(255,255,255,0.01)',
  },
  nord: {
    name: 'Nord',
    isDark: true,
    bg: '#242933',
    bgPure: '#000000',
    surface: '#2E3440',
    surfaceHover: '#3B4252',
    border: '#434C5E',
    text: '#D8DEE9',
    textSecondary: '#E5E9F0',
    textMuted: '#4C566A',
    accent: '#88C0D0',
    accentMuted: 'rgba(136,192,208,0.12)',
    danger: '#BF616A',
    dangerMuted: 'rgba(191,97,106,0.12)',
    success: '#A3BE8C',
    warning: '#EBCB8B',
    tabBar: '#1F242D',
    tabBorder: '#2E3440',
    inputBg: '#2E3440',
    inputBorder: '#434C5E',
    ambientGradient: ['rgba(136,192,208,0.15)', '#242933'] as const,
    glassFill: 'rgba(136,192,208,0.04)',
    glassBorder: 'rgba(136,192,208,0.15)',
    glassHighlight: 'rgba(136,192,208,0.10)',
    glassHeavyFill: 'rgba(136,192,208,0.08)',
    glassLightFill: 'rgba(136,192,208,0.02)',
  },
  tokyonight: {
    name: 'Tokyo Night',
    isDark: true,
    bg: '#16161E',
    bgPure: '#000000',
    surface: '#1A1B26',
    surfaceHover: '#24283B',
    border: '#292E42',
    text: '#C0CAF5',
    textSecondary: '#9AA5CE',
    textMuted: '#565F89',
    accent: '#7AA2F7',
    accentMuted: 'rgba(122,162,247,0.12)',
    danger: '#F7768E',
    dangerMuted: 'rgba(247,118,142,0.12)',
    success: '#9ECE6A',
    warning: '#E0AF68',
    tabBar: '#13131A',
    tabBorder: '#1A1B26',
    inputBg: '#1A1B26',
    inputBorder: '#292E42',
    ambientGradient: ['rgba(122,162,247,0.15)', '#16161E'] as const,
    glassFill: 'rgba(122,162,247,0.04)',
    glassBorder: 'rgba(122,162,247,0.15)',
    glassHighlight: 'rgba(122,162,247,0.10)',
    glassHeavyFill: 'rgba(122,162,247,0.08)',
    glassLightFill: 'rgba(122,162,247,0.02)',
  },
  rosepine: {
    name: 'Rosé Pine',
    isDark: true,
    bg: '#15131C',
    bgPure: '#000000',
    surface: '#191724',
    surfaceHover: '#1F1D2E',
    border: '#211F2D',
    text: '#E0DEF4',
    textSecondary: '#908CAA',
    textMuted: '#6E6A86',
    accent: '#EBBCBA',
    accentMuted: 'rgba(235,188,186,0.12)',
    danger: '#EB6F92',
    dangerMuted: 'rgba(235,111,146,0.12)',
    success: '#9CCFD8',
    warning: '#F6C177',
    tabBar: '#110F17',
    tabBorder: '#191724',
    inputBg: '#191724',
    inputBorder: '#211F2D',
    ambientGradient: ['rgba(235,188,186,0.15)', '#15131C'] as const,
    glassFill: 'rgba(235,188,186,0.04)',
    glassBorder: 'rgba(235,188,186,0.15)',
    glassHighlight: 'rgba(235,188,186,0.10)',
    glassHeavyFill: 'rgba(235,188,186,0.08)',
    glassLightFill: 'rgba(235,188,186,0.02)',
  },
  light: {
    name: 'Light',
    isDark: false,
    bg: '#FAFAFA',
    bgPure: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceHover: '#F4F4F5',
    border: '#E4E4E7',
    text: '#09090B',
    textSecondary: '#52525B',
    textMuted: '#A1A1AA',
    accent: '#09090B',
    accentMuted: 'rgba(9,9,11,0.08)',
    danger: '#DC2626',
    dangerMuted: 'rgba(220,38,38,0.10)',
    success: '#16A34A',
    warning: '#D97706',
    tabBar: '#FFFFFF',
    tabBorder: '#E4E4E7',
    inputBg: '#F4F4F5',
    inputBorder: '#E4E4E7',
    glassFill: 'rgba(255,255,255,0.50)',
    glassBorder: 'rgba(0,0,0,0.08)',
    glassHighlight: 'rgba(255,255,255,1.0)',
    glassHeavyFill: 'rgba(255,255,255,0.75)',
    glassLightFill: 'rgba(255,255,255,0.25)',
    ambientGradient: ['rgba(0,0,0,0.02)', '#FAFAFA'] as const,
  },
  nord_light: {
    name: 'Nord Light',
    isDark: false,
    bg: '#ECEFF4',
    bgPure: '#FFFFFF',
    surface: '#E5E9F0',
    surfaceHover: '#D8DEE9',
    border: '#D8DEE9',
    text: '#2E3440',
    textSecondary: '#3B4252',
    textMuted: '#4C566A',
    accent: '#5E81AC',
    accentMuted: 'rgba(94,129,172,0.12)',
    danger: '#BF616A',
    dangerMuted: 'rgba(191,97,106,0.12)',
    success: '#A3BE8C',
    warning: '#EBCB8B',
    tabBar: '#ECEFF4',
    tabBorder: '#D8DEE9',
    inputBg: '#E5E9F0',
    inputBorder: '#D8DEE9',
    glassFill: 'rgba(236,239,244,0.30)',
    glassBorder: 'rgba(46,52,64,0.10)',
    glassHighlight: 'rgba(255,255,255,0.95)',
    glassHeavyFill: 'rgba(236,239,244,0.44)',
    glassLightFill: 'rgba(236,239,244,0.18)',
    ambientGradient: ['rgba(94,129,172,0.15)', '#ECEFF4'] as const,
  },
  tokyonight_day: {
    name: 'Tokyo Night Day',
    isDark: false,
    bg: '#E1E2E7',
    bgPure: '#FFFFFF',
    surface: '#D5D6DB',
    surfaceHover: '#C6C7CD',
    border: '#C6C7CD',
    text: '#3760BF',
    textSecondary: '#5A78CA',
    textMuted: '#8C9FD7',
    accent: '#2E7DE9',
    accentMuted: 'rgba(46,125,233,0.12)',
    danger: '#F52A65',
    dangerMuted: 'rgba(245,42,101,0.12)',
    success: '#587539',
    warning: '#8C6C3E',
    tabBar: '#E1E2E7',
    tabBorder: '#C6C7CD',
    inputBg: '#D5D6DB',
    inputBorder: '#C6C7CD',
    glassFill: 'rgba(225,226,231,0.30)',
    glassBorder: 'rgba(55,96,191,0.10)',
    glassHighlight: 'rgba(255,255,255,0.95)',
    glassHeavyFill: 'rgba(225,226,231,0.44)',
    glassLightFill: 'rgba(225,226,231,0.18)',
    ambientGradient: ['rgba(46,125,233,0.15)', '#E1E2E7'] as const,
  },
  rosepine_dawn: {
    name: 'Rosé Pine Dawn',
    isDark: false,
    bg: '#FAF4ED',
    bgPure: '#FFFFFF',
    surface: '#FFFDF9',
    surfaceHover: '#F2E9E1',
    border: '#DFDAD9',
    text: '#575279',
    textSecondary: '#797593',
    textMuted: '#9893A5',
    accent: '#907AA9',
    accentMuted: 'rgba(144,122,169,0.12)',
    danger: '#B4637A',
    dangerMuted: 'rgba(180,99,122,0.12)',
    success: '#286983',
    warning: '#EA9D34',
    tabBar: '#FAF4ED',
    tabBorder: '#DFDAD9',
    inputBg: '#FFFDF9',
    inputBorder: '#DFDAD9',
    glassFill: 'rgba(250,244,237,0.30)',
    glassBorder: 'rgba(87,82,121,0.10)',
    glassHighlight: 'rgba(255,255,255,0.95)',
    glassHeavyFill: 'rgba(250,244,237,0.44)',
    glassLightFill: 'rgba(250,244,237,0.18)',
    ambientGradient: ['rgba(144,122,169,0.15)', '#FAF4ED'] as const,
  },
};


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


const RADIUS_MAP = {
  small:  { sm: 4, md: 8, lg: 10, xl: 12, card: 10, full: 9999 },
  medium: { sm: 6, md: 10, lg: 14, xl: 18, card: 14, full: 9999 },
  large:  { sm: 8, md: 12, lg: 16, xl: 20, card: 18, full: 9999 },
} as const;



const MOCK_ONLINE_USER_IDS = new Set(['u1', 'u4', 'u5', 'u7']);


export const getPairedTheme = (themeName: ThemeName, wantDark: boolean): ThemeColors => {
  const base = THEMES[themeName] || THEMES.midnight;
  if (base.isDark === wantDark) return base;
    const map: Record<string, ThemeName> = {
      'midnight': 'light',
      'amoled': 'light',
      'nord': 'nord_light',
      'tokyonight': 'tokyonight_day',
      'rosepine': 'rosepine_dawn',
      'light': 'midnight',
      'nord_light': 'nord',
      'tokyonight_day': 'tokyonight',
      'rosepine_dawn': 'rosepine',
    };
  
  const pairedKey = map[themeName];
  return pairedKey && THEMES[pairedKey] ? THEMES[pairedKey] : (wantDark ? THEMES.midnight : THEMES.light);
};

export function useTheme() {
  const themeName = useAppStore(s => s.theme);
  const darkMode = useAppStore(s => s.darkMode);
  const accentColor = useAppStore(s => s.accentColor);
  const pureBlackBg = useAppStore(s => s.pureBlackBackground);
  const fontSize = useAppStore(s => s.fontSize);
  const fontStyle = useAppStore(s => s.fontStyle);
  const fontScale = useAppStore(s => s.fontScale);
  const reduceAnimations = useAppStore(s => s.reduceAnimations);
  const showAvatars = useAppStore(s => s.showAvatars);
  const roundedCorners = useAppStore(s => s.roundedCorners);
  const onlineStatus = useAppStore(s => s.onlineStatus);
  const presenceIds = usePresenceStore(s => s.onlineIds);

  const base = getPairedTheme(themeName, darkMode);

  
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

  
  

  const switchTrack = { false: colors.surfaceHover, true: colors.accent };

  const isUserOnline = (userId: string): boolean => {
    return onlineStatus && (presenceIds.has(userId) || MOCK_ONLINE_USER_IDS.has(userId));
  };

  const font = buildFontPreset(fontStyle);

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
