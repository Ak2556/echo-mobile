import React from 'react';
import { View, StyleSheet } from 'react-native';
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
    case 'camera': return <Camera {...p} />;
    case 'image-editor': return <ImageSquare {...p} />;
    case 'world-clock': return <Globe {...p} />;
    case 'markdown': return <FileText {...p} />;
    case 'dice': return <DiceFive {...p} />;
    case 'json-formatter': return <Code {...p} />;
    case 'color-tools': return <Palette {...p} />;
    default: return <ListChecks {...p} />;
  }
}

export function MiniAppIcon({ id, color, size = 44, weight = 'fill', plate = true }: MiniAppIconProps) {
  if (!plate) return <MiniAppGlyph id={id} color={color} size={size} weight={weight} />;

  const radius = Math.round(size * 0.28);
  return (
    <View style={{ width: size, height: size }}>
      {/* Three-stop diagonal gradient (lighter top-left → base → deeper
          bottom-right) gives the plate real depth — an App-Store-grade icon,
          not a flat swatch. */}
      <LinearGradient
        colors={[shade(color, -0.16), color, shade(color, 0.34)]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Glossy top sheen for a premium, lit-from-above feel. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: Math.max(6, size * 0.42),
            backgroundColor: 'rgba(255,255,255,0.20)',
            borderBottomLeftRadius: size,
            borderBottomRightRadius: size,
          }}
        />
        <MiniAppGlyph id={id} color="#fff" size={Math.round(size * 0.54)} weight={weight} />
      </LinearGradient>
      {/* Crisp inner hairline ring — separates the icon cleanly from any
          background and sharpens the edge at every size. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          borderRadius: radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: 'rgba(255,255,255,0.28)',
        }}
      />
    </View>
  );
}
