import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Icon } from 'phosphor-react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { useTheme } from '../../lib/ui/theme';
import { ON_STATUS } from '../../lib/ui/fixedColors';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'compact' | 'regular' | 'large';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the content and ignores presses. */
  loading?: boolean;
  disabled?: boolean;
  /** Stretches to the width of its container. Otherwise it is as wide as its content. */
  fullWidth?: boolean;
  /** Phosphor icons, drawn in the button's own text colour. */
  leftIcon?: Icon;
  rightIcon?: Icon;
  accessibilityLabel?: string;
  /** Outer spacing and alignment only (margins, alignSelf). */
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = { compact: 36, regular: 48, large: 56 };
const PAD_X: Record<ButtonSize, number> = { compact: 14, regular: 20, large: 24 };
const ICON: Record<ButtonSize, number> = { compact: 16, regular: 18, large: 20 };

/**
 * The one text button. A pill at one of three heights, in four variants, with a loading
 * state and the right accessibility state. Every box property lives on an inner View
 * because box props on the pressable itself can drop out in release builds.
 *
 * Primary text is `colors.onAccent`, so it stays readable on whatever accent the person
 * chose; danger text is white on the theme's danger colour.
 */
export function Button({
  label, onPress, variant = 'primary', size = 'regular', loading = false, disabled = false,
  fullWidth = false, leftIcon: Left, rightIcon: Right, accessibilityLabel, style,
}: ButtonProps) {
  const { colors, font, fontSizes } = useTheme();
  const inert = disabled || loading;

  const bg = variant === 'primary' ? colors.accent
    : variant === 'danger' ? colors.danger
    : variant === 'secondary' ? colors.surfaceHover
    : 'transparent';
  const fg = variant === 'primary' ? colors.onAccent
    : variant === 'danger' ? ON_STATUS
    : variant === 'secondary' ? colors.text
    : colors.textSecondary;
  const bordered = variant === 'secondary';

  return (
    <View style={[fullWidth ? styles.stretch : styles.hug, style]}>
      <AnimatedPressable
        onPress={inert ? undefined : onPress}
        disabled={inert}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: inert, busy: loading }}
      >
        <View
          style={{
            minHeight: HEIGHT[size],
            paddingHorizontal: PAD_X[size],
            borderRadius: HEIGHT[size] / 2,
            backgroundColor: bg,
            borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
            borderColor: bordered ? colors.border : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: disabled && !loading ? 0.55 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={fg} />
          ) : (
            <>
              {Left ? <Left color={fg} size={ICON[size]} weight="bold" /> : null}
              <Text style={[font.bodyBold, { color: fg, fontSize: size === 'compact' ? fontSizes.small : fontSizes.body }]}>{label}</Text>
              {Right ? <Right color={fg} size={ICON[size]} weight="bold" /> : null}
            </>
          )}
        </View>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stretch: { alignSelf: 'stretch' },
  hug: { alignSelf: 'flex-start' },
});
