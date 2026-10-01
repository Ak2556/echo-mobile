import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../../src/shared/lib/theme';

/**
 * A light, see-through glass chip for small controls that repeat down a list:
 * the like / comment / re-echo / save / remix / share row on every feed card.
 *
 * Deliberately has no live blur and no shader. Those buttons used to be a
 * LiquidGlass `clear` each, which on Android is a dimezis BlurView plus a Skia
 * shader per button. A blur view re-renders everything behind it into a
 * software bitmap on every frame its content moves, and a scrolling feed moves
 * every frame. Home had about 46 of them on screen: 72-99% of scroll frames
 * janked, with 25-38 ms of layout per frame. With static chips: 6% and 3 ms
 * (release build, 2026-10-01).
 *
 * The glass look is a single layer: a light translucent fill with a hairline
 * edge, so it reads as a see-through pane over the card. Live blur stays on
 * the large chrome (EdgeGlass header and tab bar, sheets), where there are a
 * handful of them rather than one per button.
 */
export function GlassChip({
  borderRadius,
  tint,
  style,
  contentStyle,
  children,
}: {
  borderRadius: number;
  /** An active state's colour; the chip takes a light wash of it. */
  tint?: string;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const fill = tint ? `${tint}1A` : colors.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.28)';
  const edge = tint ? `${tint}4D` : colors.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';

  return (
    <View style={[{ borderRadius, overflow: 'hidden', backgroundColor: fill, borderWidth: StyleSheet.hairlineWidth, borderColor: edge }, style]}>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}
