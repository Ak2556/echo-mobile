import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../lib/theme';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Typographic empty state. Replaces the older icon-in-a-square treatment
 * with a quieter, more editorial layout: a small accent rule, a confident
 * display-weight title, generous line-height on the subtitle, and a
 * single outline-style CTA. Icon is optional — most uses can drop it.
 */
export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const { colors, radius, animation, font } = useTheme();

  return (
    <Animated.View
      entering={animation(FadeIn.duration(220))}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 32 }}
    >
      {icon && (
        <View style={{ marginBottom: 18, opacity: 0.7 }}>
          {icon}
        </View>
      )}
      {/* Accent rule above the title — small typographic moment. */}
      <View style={{ width: 24, height: 2, backgroundColor: colors.accent, borderRadius: 1, marginBottom: 14 }} />
      <Text
        style={[
          font.display,
          { color: colors.text, fontSize: 22, textAlign: 'center', marginBottom: 10, maxWidth: 320 },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          font.body,
          { color: colors.textMuted, textAlign: 'center', fontSize: 14, lineHeight: 22, maxWidth: 340 },
        ]}
      >
        {subtitle}
      </Text>
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => ({
            marginTop: 22,
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: radius.full,
            backgroundColor: pressed ? colors.surfaceHover : 'transparent',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.accent,
          })}
        >
          <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 14 }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
