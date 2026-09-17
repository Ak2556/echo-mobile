import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { NativeGlassContainer, isNativeGlassAvailable } from './nativeGlass';

/**
 * Groups adjacent glass controls so they behave as one material.
 *
 * On iOS 26 this is `GlassContainer`: panes inside it bulge toward their
 * neighbours and merge as they near, which is what makes a row of buttons read as
 * a single strip of liquid rather than six separate tiles. `spacing` is the
 * distance at which they start to notice each other.
 *
 * Everywhere else it is a plain View and costs nothing. There is no approximation
 * of the merge on the fallback path, and deliberately so — a fake merge drawn with
 * gradients would be a smear between two buttons, which is worse than two honest
 * buttons.
 */
export function GlassRow({
  children,
  spacing = 12,
  style,
}: {
  children: React.ReactNode;
  spacing?: number;
  style?: ViewStyle;
}) {
  if (isNativeGlassAvailable() && NativeGlassContainer) {
    return (
      <NativeGlassContainer spacing={spacing} style={style}>
        {children}
      </NativeGlassContainer>
    );
  }
  return <View style={style}>{children}</View>;
}
