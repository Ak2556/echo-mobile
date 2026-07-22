import React from 'react';
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';

interface SectionHeaderProps {
  label: string;
  /** Optional secondary note shown after a middot. */
  sub?: string;
  /** Optional single trailing action (accent link). */
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

/**
 * The one section header — an uppercase eyebrow label with an optional sub-note
 * and a single trailing action. The canonical way to denote a section, so
 * every list/feed screen reads with the same rhythm.
 */
export function SectionHeader({ label, sub, action, style }: SectionHeaderProps) {
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'baseline',
          paddingHorizontal: layout.gutter,
          marginTop: layout.isDesktop ? 28 : 30,
          marginBottom: 12,
          gap: 8,
        },
        style,
      ]}
    >
      <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' }]}>
        {label}
      </Text>
      {sub ? (
        <Text style={[font.body, { color: colors.textMuted, fontSize: 12, flex: 1 }]} numberOfLines={1}>· {sub}</Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={action.label}>
          <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 13 }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
