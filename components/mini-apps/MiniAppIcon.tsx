import React from 'react';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  Key,
  ListChecks,
  Microphone,
  NotePencil,
  Pulse,
  Receipt,
  ShoppingCart,
  Sparkle,
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

// factor > 0 darkens, factor < 0 lightens. Clamped 0–255 both ways so a
// lighter top stop is safe.
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.min(255, Math.max(0, Math.round(c * (1 - factor))));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function MiniAppGlyph({ id, color, size = 24, weight = 'fill' }: MiniAppGlyphProps) {
  const p = { color, size, weight };
  switch (id) {
    case 'echo-ai': return <Sparkle {...p} />;
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
  if (!plate) return <MiniAppGlyph id={id} color={color} size={size} weight={weight} />;

  const radius = Math.round(size * 0.235); // iOS-squircle-ish

  // Designed asset wins when present — the real path to system-grade icons.
  const asset = ICON_ASSETS[id];
  if (asset) {
    return <Image source={asset} style={{ width: size, height: size, borderRadius: radius }} resizeMode="cover" />;
  }
  // A restrained diagonal gradient — subtle depth, no glossy sheen and no
  // decorative ring (that gloss is exactly what reads cheap/"AI-made"). Flat,
  // confident, generous glyph padding — the modern app-icon look.
  return (
    <LinearGradient
      colors={[shade(color, -0.1), color, shade(color, 0.18)]}
      locations={[0, 0.5, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MiniAppGlyph id={id} color="#fff" size={Math.round(size * 0.46)} weight={weight} />
    </LinearGradient>
  );
}
