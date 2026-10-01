import React from 'react';
import {
  Barbell, BookOpen, Broom, Drop, FlowerLotus, ForkKnife, Moon, PencilLine,
  PersonSimpleRun, Pill, Plant, Target, type IconProps,
} from 'phosphor-react-native';

/**
 * The icon for a habit's stored marker code. The codes replaced the original
 * emoji one for one (💧 🏃 📚 🧘 🥗 😴 💊 ✍️ 🎯 🧹 🌱 💪) and were shown as bare
 * letters, so the picker offered "HY", "RN", "RD" with nothing to say what
 * they meant.
 */
const MARKER_ICONS: Record<string, { Icon: React.ComponentType<IconProps>; label: string }> = {
  HY: { Icon: Drop, label: 'Hydrate' },
  RN: { Icon: PersonSimpleRun, label: 'Run' },
  RD: { Icon: BookOpen, label: 'Read' },
  MD: { Icon: FlowerLotus, label: 'Meditate' },
  ME: { Icon: ForkKnife, label: 'Eat well' },
  SL: { Icon: Moon, label: 'Sleep' },
  RX: { Icon: Pill, label: 'Medicine' },
  WR: { Icon: PencilLine, label: 'Write' },
  GO: { Icon: Target, label: 'Goal' },
  CL: { Icon: Broom, label: 'Clean' },
  GR: { Icon: Plant, label: 'Grow' },
  ST: { Icon: Barbell, label: 'Strength' },
};

export function habitMarkerLabel(marker: string): string {
  return MARKER_ICONS[marker]?.label ?? marker;
}

export function HabitMarkerIcon({ marker, color, size = 22 }: { marker: string; color: string; size?: number }) {
  const Icon = (MARKER_ICONS[marker] ?? MARKER_ICONS.GO).Icon;
  return <Icon color={color} size={size} weight="bold" />;
}
