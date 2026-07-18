import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Icon } from 'phosphor-react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { ICON_SIZE, ICON_WEIGHT, type IconSizeToken, type IconRole } from '../../lib/icons';

interface IconButtonProps {
  /** The phosphor icon component, e.g. `MagnifyingGlass`. */
  icon: Icon;
  /** Required accessibility label — no unlabeled icon buttons. */
  label: string;
  onPress?: () => void;
  /** Glyph size token (default `md` = 20). */
  size?: IconSizeToken;
  /** Weight role: resting (regular) · active (fill) · hero (duotone). */
  role?: IconRole;
  /** Glyph color (defaults to theme text, or white for `solid`). */
  color?: string;
  /** Container treatment. `surface` = bordered chip (header actions),
   *  `tinted` = accent wash, `solid` = filled accent, `plain` = bare. */
  variant?: 'plain' | 'surface' | 'tinted' | 'solid';
  /** Accent for tinted/solid variants (defaults to theme accent). */
  tint?: string;
  /** Circular hit-target diameter (default 40). */
  hitSize?: number;
  disabled?: boolean;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  style?: StyleProp<ViewStyle>;
}

/**
 * The single icon-button primitive for the app. Guarantees a consistent
 * circular hit target, press feedback, and an accessibility label — and puts
 * all layout on an inner View so the reanimated pressable can't drop it.
 */
export function IconButton({
  icon: Glyph,
  label,
  onPress,
  size = 'md',
  role = 'resting',
  color,
  variant = 'plain',
  tint,
  hitSize = 40,
  disabled = false,
  haptic = 'light',
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const accent = tint ?? colors.accent;
  const glyphColor = color ?? (variant === 'solid' ? '#fff' : colors.text);
  const bg = variant === 'solid' ? accent
    : variant === 'tinted' ? accent + '1A'
    : variant === 'surface' ? colors.surface
    : 'transparent';
  const bordered = variant === 'surface';

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={[{
          width: hitSize,
          height: hitSize,
          borderRadius: hitSize / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
          borderColor: bordered ? colors.border : 'transparent',
        }, style]}
      >
        <Glyph color={glyphColor} size={ICON_SIZE[size]} weight={ICON_WEIGHT[role]} />
      </View>
    </AnimatedPressable>
  );
}
