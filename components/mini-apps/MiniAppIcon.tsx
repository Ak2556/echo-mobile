import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../../lib/ui/theme';
import {
  ArrowsLeftRight,
  Barbell,
  Calculator,
  CalendarBlank,
  Camera,
  CheckCircle,
  FileText,
  GraduationCap,
  Globe,
  ImageSquare,
  Aperture,
  Storefront,
  Key,
  ListChecks,
  Microphone,
  NotePencil,
  Pulse,
  Receipt,
  ShoppingCart,
  Waveform,
  Timer,
  Wallet,
  DiceFive,
  Code,
  Palette,
  SlidersHorizontal,
} from 'phosphor-react-native';

type MiniAppIconWeight = 'regular' | 'bold' | 'fill';

interface MiniAppGlyphProps {
  id: string;
  color: string;
  size?: number;
  weight?: MiniAppIconWeight;
}

interface MiniAppIconProps extends MiniAppGlyphProps {
  plate?: boolean;
  /** Pressed or hovered: the tile's colour gets stronger. */
  active?: boolean;
}

export function MiniAppGlyph({ id, color, size = 24, weight = 'fill' }: MiniAppGlyphProps) {
  const p = { color, size, weight };
  switch (id) {
    case 'echo-ai': return <Waveform {...p} />;
    case 'tasks': return <ListChecks {...p} />;
    case 'planner': return <CalendarBlank {...p} />;
    case 'notes': return <NotePencil {...p} />;
    case 'pomodoro': return <Timer {...p} />;
    case 'learn': return <GraduationCap {...p} />;
    case 'habits': return <CheckCircle {...p} />;
    case 'expenses': return <Wallet {...p} />;
    case 'shopping-list': return <ShoppingCart {...p} />;
    case 'fitness': return <Barbell {...p} />;
    case 'bmi': return <Pulse {...p} />;
    case 'calculator': return <Calculator {...p} />;
    case 'converter': return <ArrowsLeftRight {...p} />;
    case 'bill-splitter': return <Receipt {...p} />;
    case 'password-gen': return <Key {...p} />;
    case 'voice-memo': return <Microphone {...p} />;
    case 'studio': return <Aperture {...p} />;
    case 'world-clock': return <Globe {...p} />;
    case 'markdown': return <FileText {...p} />;
    case 'dice': return <DiceFive {...p} />;
    case 'json-formatter': return <Code {...p} />;
    case 'color-tools': return <Palette {...p} />;
    case 'editor': return <SlidersHorizontal {...p} />;
    case 'marketplace': return <Storefront {...p} />;
    default: return <ListChecks {...p} />;
  }
}

// Designed icon art, keyed by mini-app id. Drop 1024×1024 full-bleed PNGs into
// assets/mini-app-icons/<id>.png and add a line here — that id then renders the
// real designed icon; any id without an asset falls back to the generated plate
// below, so this can be filled in incrementally.
const ICON_ASSETS: Record<string, number> = {
  // tasks: require('../../assets/mini-app-icons/tasks.png'),
  // habits: require('../../assets/mini-app-icons/habits.png'),
  // …
};

/**
 * Tool colours for the Mono palette: one hue per tool so each keeps an identity,
 * spaced around the wheel at a similar strength so no tile shouts. No pure red
 * (likes and delete) and no ember (the logo). Tools not listed keep their
 * catalog colour.
 */
export const TOOL_TINT: Record<string, string> = {
  tasks: '#5B8DEF',
  habits: '#3FB37F',
  fitness: '#2BB3A6',
  notes: '#E0A63A',
  pomodoro: '#E8775A',
  expenses: '#9A7BE8',
  learn: '#3EA8D8',
  planner: '#7B83EB',
  'shopping-list': '#74B84A',
  studio: '#B07FB0',
  editor: '#E38B3E',
  marketplace: '#C99A4E',
};

/** Mix a hex colour toward black (amount > 0) so a glyph keeps contrast on a light tile. */
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const ch = (v: number) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function MiniAppIcon({ id, color, size = 44, weight = 'fill', plate = true, active = false }: MiniAppIconProps) {
  const { colors } = useTheme();
  if (!plate) return <MiniAppGlyph id={id} color={color} size={size} weight={weight} />;

  const radius = Math.round(size * 0.235); // iOS-squircle-ish

  // Designed asset wins when present — the real path to system-grade icons.
  const asset = ICON_ASSETS[id];
  if (asset) {
    return <Image source={asset} style={{ width: size, height: size, borderRadius: radius }} resizeMode="cover" />;
  }
  // Mono palette (2026-11-28): the app is greyscale, tools keep a colour each,
  // as a coloured glyph on a faint wash of the same colour. Full-colour gradient
  // tiles made the grid read like a toy box; all-grey tiles read as disabled.
  const tint = TOOL_TINT[id] ?? color;
  const glyph = colors.isDark ? tint : darken(tint, 0.28);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withAlpha(tint, active ? 0.3 : (colors.isDark ? 0.16 : 0.13)),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: withAlpha(tint, active ? 0.5 : 0.26),
      }}
    >
      <MiniAppGlyph id={id} color={glyph} size={Math.round(size * 0.46)} weight={weight} />
    </View>
  );
}
