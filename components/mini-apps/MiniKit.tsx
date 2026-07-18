import React from 'react';
import { View, Text, StyleSheet, TextInput, type ViewStyle, type TextStyle, type StyleProp } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../lib/theme';
import { GlassPanel } from '../ui/GlassPanel';
import { AnimatedPressable } from '../ui/AnimatedPressable';

/**
 * MiniKit — the shared vocabulary every mini-app composes from, so the whole
 * suite reads as one app instead of a drawer of separate utilities. Structure
 * (hero, stat, chip, card, section header, empty, buttons, input) is identical
 * everywhere; the per-app `accent` is the only thing that changes. Match the
 * app's editorial language: Fraunces for display, Inter for UI, warm palette,
 * generous restraint. Interaction feedback (scale + haptics) and accessibility
 * are baked in so no app can drift.
 */

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.round(c * (1 - factor)));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export interface MiniStat {
  label: string;
  value: string;
}

export interface MiniDeckMetric {
  label: string;
  value: string;
  detail?: string;
}

export function MiniCommandDeck({
  accent,
  title,
  subtitle,
  metrics,
  chips = [],
  compact = false,
}: {
  accent: string;
  title: string;
  subtitle: string;
  metrics: MiniDeckMetric[];
  chips?: string[];
  compact?: boolean;
}) {
  const { colors, font } = useTheme();
  return (
    <GlassPanel
      variant="medium"
      borderRadius={compact ? 18 : 22}
      elevated={!compact}
      style={{ marginBottom: compact ? 10 : 16, borderColor: `${accent}38` }}
      contentStyle={{ padding: compact ? 11 : 16 }}
    >
      <LinearGradient
        colors={[`${accent}22`, colors.isDark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.52)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: compact ? 9 : 12 }}>
        <View style={{ width: compact ? 5 : 6, alignSelf: 'stretch', minHeight: compact ? 38 : 62, borderRadius: 99, backgroundColor: accent }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[font.display, { color: colors.text, fontSize: compact ? 16 : 21, lineHeight: compact ? 20 : 26 }]} numberOfLines={compact ? 1 : 2}>
            {title}
          </Text>
          <Text style={[font.body, { color: colors.textMuted, fontSize: compact ? 11.2 : 12.5, lineHeight: compact ? 15 : 17, marginTop: 3 }]} numberOfLines={compact ? 1 : 2}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: compact ? 6 : 8, marginTop: compact ? 10 : 15 }}>
        {metrics.slice(0, 3).map(metric => (
          <View
            key={metric.label}
            style={{
              flex: 1,
              minHeight: compact ? 48 : 70,
              borderRadius: compact ? 12 : 15,
              padding: compact ? 8 : 11,
              backgroundColor: colors.surfaceHover,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
            }}
          >
            <Text style={[font.display, { color: accent, fontSize: compact ? 16 : 22, lineHeight: compact ? 18 : 25 }]} numberOfLines={1}>
              {metric.value}
            </Text>
            <Text style={[font.bodySemibold, { color: colors.text, fontSize: compact ? 10.2 : 11.5, marginTop: compact ? 1 : 3 }]} numberOfLines={1}>
              {metric.label}
            </Text>
            {metric.detail && !compact ? (
              <Text style={[font.body, { color: colors.textMuted, fontSize: 10.5, marginTop: 1 }]} numberOfLines={1}>
                {metric.detail}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {chips.length > 0 && !compact ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
          {chips.slice(0, 4).map(chip => (
            <View
              key={chip}
              style={{
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: `${accent}17`,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: `${accent}40`,
              }}
            >
              <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 11.2 }]} numberOfLines={1}>
                {chip}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </GlassPanel>
  );
}

/** Hero block: accent glyph + Fraunces headline + caption + optional stat row. */
export function MiniHero({
  accent,
  icon,
  title,
  subtitle,
  stats,
}: {
  accent: string;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  stats?: MiniStat[];
}) {
  const { colors, font } = useTheme();
  return (
    <GlassPanel
      variant="medium"
      borderRadius={24}
      elevated
      style={{ marginBottom: 14, borderColor: `${accent}33` }}
      contentStyle={{ padding: 18 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {icon ? (
          <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
            {icon}
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[font.display, { color: colors.text, fontSize: 22, lineHeight: 27 }]} numberOfLines={2}>{title}</Text>
          {subtitle ? (
            <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 }]} numberOfLines={2}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {stats && stats.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {stats.slice(0, 3).map(stat => <MiniStatCard key={stat.label} value={stat.value} label={stat.label} accent={accent} />)}
        </View>
      ) : null}
    </GlassPanel>
  );
}

/** One stat cell — Fraunces value over an eyebrow label. Fills its flex parent. */
export function MiniStatCard({ value, label, accent }: { value: string; label: string; accent?: string }) {
  const { colors, font } = useTheme();
  return (
    <View style={{
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.glassBorder,
    }}>
      <Text style={[font.display, { color: accent ?? colors.text, fontSize: 22 }]} numberOfLines={1}>{value}</Text>
      <Text style={[font.eyebrow, { color: colors.textMuted, fontSize: 10.5, marginTop: 3 }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Pill chip for tabs / filters. Feedback + a11y baked in. */
export function MiniChip({
  label,
  active,
  onPress,
  accent,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accent: string;
  /** optional glyph before the label — receives no color, so pass a colored icon */
  icon?: React.ReactNode;
}) {
  const { colors, font } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      scaleValue={0.94}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 13,
        paddingVertical: 8,
        backgroundColor: active ? accent : colors.surfaceHover,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? accent : colors.border,
      }}>
        {icon}
        <Text style={[font.bodySemibold, { color: active ? '#fff' : colors.textSecondary, fontSize: 12.5 }]}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

/** Standard content card — consistent radius, tint, accent-tinted border. */
export function MiniCard({
  children,
  accent,
  elevated,
  padding = 16,
  style,
}: {
  children: React.ReactNode;
  accent?: string;
  elevated?: boolean;
  padding?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <GlassPanel
      variant="medium"
      borderRadius={20}
      elevated={elevated}
      style={{ borderColor: accent ? `${accent}2E` : colors.glassBorder, ...(style ?? {}) }}
      contentStyle={{ padding }}
    >
      {children}
    </GlassPanel>
  );
}

/** Uppercase eyebrow section header + optional trailing action. */
export function MiniSectionHeader({
  label,
  actionLabel,
  onAction,
  accent,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
  accent?: string;
}) {
  const { colors, font } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 }}>
      <Text style={[font.eyebrow, { color: colors.textMuted, flex: 1 }]}>{label}</Text>
      {actionLabel && onAction ? (
        <AnimatedPressable onPress={onAction} haptic="light" accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={[font.bodySemibold, { color: accent ?? colors.accent, fontSize: 13 }]}>{actionLabel}</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

/** Editorial empty state — accent rule + Fraunces title + optional accent CTA. */
export function MiniEmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  accent,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  accent: string;
}) {
  const { colors, font } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 48 }}>
      {icon ? <View style={{ marginBottom: 16, opacity: 0.65 }}>{icon}</View> : null}
      <View style={{ width: 24, height: 2, backgroundColor: accent, borderRadius: 1, marginBottom: 14 }} />
      <Text style={[font.display, { color: colors.text, fontSize: 21, textAlign: 'center', marginBottom: 8, maxWidth: 300 }]}>{title}</Text>
      <Text style={[font.body, { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 320 }]}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <MiniButton label={actionLabel} onPress={onAction} accent={accent} style={{ marginTop: 20 }} />
      ) : null}
    </Animated.View>
  );
}

/** Primary (filled accent) / secondary (surface) button. Feedback + a11y baked in. */
export function MiniButton({
  label,
  onPress,
  accent,
  variant = 'primary',
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  accent: string;
  variant?: 'primary' | 'secondary';
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const { colors, font } = useTheme();
  const filled = variant === 'primary';
  return (
    <AnimatedPressable
      onPress={onPress}
      scaleValue={0.96}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={style}
    >
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 48,
        borderRadius: 16,
        paddingHorizontal: 20,
        overflow: 'hidden',
        backgroundColor: filled ? accent : colors.surface,
        borderWidth: filled ? 0 : StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
        shadowColor: filled ? accent : '#000',
        shadowOpacity: filled ? 0.22 : (colors.isDark ? 0.16 : 0.07),
        shadowRadius: filled ? 14 : 8,
        shadowOffset: { width: 0, height: filled ? 8 : 4 },
        elevation: filled ? 4 : 2,
      }}>
        {filled ? (
          <>
            <LinearGradient
              colors={[accent, shade(accent, 0.18)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: 'rgba(255,255,255,0.28)',
              }}
            />
          </>
        ) : null}
        {icon}
        <Text style={[font.bodyBold, { color: filled ? '#fff' : colors.text, fontSize: 15 }]}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

/** Consistent text field. */
export function MiniInput({
  value,
  onChangeText,
  placeholder,
  accent,
  multiline = false,
  keyboardType = 'default',
  autoFocus,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  accent?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad' | 'email-address';
  autoFocus?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      multiline={multiline}
      keyboardType={keyboardType}
      autoFocus={autoFocus}
      style={[{
        minHeight: multiline ? 80 : 48,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: value ? `${accent ?? colors.accent}66` : colors.glassBorder,
        backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        color: colors.text,
        paddingHorizontal: 14,
        paddingVertical: multiline ? 12 : 10,
        fontSize: 15,
        textAlignVertical: (multiline ? 'top' : 'center') as TextStyle['textAlignVertical'],
      }, style]}
    />
  );
}
