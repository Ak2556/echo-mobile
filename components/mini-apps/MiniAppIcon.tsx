import React from 'react';
import { View } from 'react-native';
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

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.round(c * (1 - factor)));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function MiniAppGlyph({ id, color, size = 24, weight = 'fill' }: MiniAppGlyphProps) {
  const p = { color, size, weight };
  switch (id) {
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
    case 'converter': return <ArrowsLeftRight {...p} />;
    default: return <ListChecks {...p} />;
  }
}

export function MiniAppIcon({ id, color, size = 44, weight = 'fill', plate = true }: MiniAppIconProps) {
  if (!plate) return <MiniAppGlyph id={id} color={color} size={size} weight={weight} />;

  return (
    <LinearGradient
      colors={[color, shade(color, 0.32)]}
      start={{ x: 0.12, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.31),
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: Math.max(8, size * 0.38),
          backgroundColor: 'rgba(255,255,255,0.18)',
          borderBottomLeftRadius: size,
          borderBottomRightRadius: size,
        }}
      />
      <View
        style={{
          width: size * 0.68,
          height: size * 0.68,
          borderRadius: size * 0.24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.13)',
        }}
      >
        <MiniAppGlyph id={id} color="#fff" size={Math.round(size * 0.46)} weight={weight} />
      </View>
    </LinearGradient>
  );
}
