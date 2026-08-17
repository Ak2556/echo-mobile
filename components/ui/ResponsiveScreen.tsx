import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useResponsiveLayout } from '../../src/shared/lib/responsive';
import { useTheme } from '../../src/shared/lib/theme';

type Width = 'content' | 'wide' | 'form' | 'full';

export interface ResponsiveScreenProps {
  children: React.ReactNode;
  /**
   * Max content-width preset. On phone every preset resolves to the full window
   * width (no change); on tablet/desktop the content is capped and centered.
   * - content (default): single-column reading width
   * - wide: multi-column / feed-with-rail width
   * - form: narrow form width
   * - full: edge-to-edge (media, camera) — no cap
   */
  width?: Width;
  /** Safe-area edges. Default ['top']. */
  edges?: readonly Edge[];
  /**
   * Add a horizontal gutter on the centered container. Default false so this is
   * a safe drop-in for screens that already manage their own inner padding —
   * the only change becomes the max-width cap + centering on large screens.
   */
  gutter?: boolean;
  /** Background override; defaults to the theme background. */
  background?: string;
  /** Style on the outer SafeAreaView. */
  style?: StyleProp<ViewStyle>;
  /** Style on the inner centered content container. */
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * The single cross-device layout contract. Wrap a screen's root in this instead
 * of a bare SafeAreaView so content reads the same on iPhone, iPad, Mac, and
 * web: full-bleed on phone, capped + centered (never stretched) on big screens.
 */
export function ResponsiveScreen({
  children,
  width = 'content',
  edges = ['top'],
  gutter = false,
  background,
  style,
  contentStyle,
}: ResponsiveScreenProps) {
  const layout = useResponsiveLayout();
  const { colors } = useTheme();

  const maxWidth =
    width === 'full'
      ? undefined
      : width === 'wide'
        ? layout.wideMaxWidth
        : width === 'form'
          ? layout.formMaxWidth
          : layout.contentMaxWidth;

  return (
    <SafeAreaView
      edges={edges as Edge[]}
      style={[{ flex: 1, backgroundColor: background ?? colors.bg }, style]}
    >
      <View
        style={[
          { flex: 1, width: '100%', alignSelf: 'center' },
          maxWidth ? { maxWidth } : null,
          gutter ? { paddingHorizontal: layout.gutter } : null,
          contentStyle,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}
