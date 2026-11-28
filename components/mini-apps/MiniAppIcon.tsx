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

export function MiniAppIcon({ id, color, size = 44, weight = 'fill', plate = true }: MiniAppIconProps) {
  const { colors } = useTheme();
  if (!plate) return <MiniAppGlyph id={id} color={color} size={size} weight={weight} />;

  const radius = Math.round(size * 0.235); // iOS-squircle-ish

  // Designed asset wins when present — the real path to system-grade icons.
  const asset = ICON_ASSETS[id];
  if (asset) {
    return <Image source={asset} style={{ width: size, height: size, borderRadius: radius }} resizeMode="cover" />;
  }
  // Mono palette (2026-11-28): every tool shares one plate, a raised neutral
  // tile with the glyph in the text colour. Twelve unrelated bright gradients
  // made the Tools grid read like a toy box. `color` still tints plate={false}.
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceHover,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      <MiniAppGlyph id={id} color={colors.text} size={Math.round(size * 0.46)} weight={weight} />
    </View>
  );
}
