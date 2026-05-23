import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { CheckCircle, XCircle, Wrench, ChartBar } from 'phosphor-react-native';
import Animated, { FadeIn, Layout, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GlassPanel } from '../ui/GlassPanel';
import { useTheme } from '../../lib/theme';
import { MOTION } from '../../lib/motion';

export type ToolCallStatus = 'pending_confirm' | 'running' | 'ok' | 'error' | 'rejected';

export interface ToolCallItem {
  id: string;
  name: string;
  preview: string;
  status: ToolCallStatus;
  args: any;
  resultSummary?: string;
  errorMessage?: string;
  requiresConfirm?: boolean;
}

interface Props {
  item: ToolCallItem;
  onConfirm?: (item: ToolCallItem) => void;
  onReject?: (item: ToolCallItem) => void;
}

export function ToolCallCard({ item, onConfirm, onReject }: Props) {
  const { colors, radius } = useTheme();
  const iconScale = useSharedValue(1);
  const iconX = useSharedValue(0);

  const isReadOnly = item.requiresConfirm === false;
  const accentColor = item.status === 'error' || item.status === 'rejected'
    ? colors.danger
    : item.status === 'ok'
      ? colors.success
      : isReadOnly
        ? colors.accent
        : '#F59E0B';

  // Success pop
  useEffect(() => {
    if (item.status === 'ok') {
      iconScale.value = withSequence(
        withSpring(0, { damping: 30, stiffness: 900 }),
        withSpring(1.28, MOTION.overshoot),
        withSpring(1, MOTION.snap)
      );
    } else if (item.status === 'error' || item.status === 'rejected') {
      // Shake: rapid left-right settle
      iconX.value = withSequence(
        withTiming(-6, { duration: 55 }),
        withTiming(6, { duration: 55 }),
        withTiming(-5, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(-3, { duration: 45 }),
        withTiming(0, { duration: 45 })
      );
    }
  }, [item.status, iconScale, iconX]);

  const iconAnim = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }, { translateX: iconX.value }],
  }));

  const statusIcon = (() => {
    switch (item.status) {
      case 'ok':
        return (
          <Animated.View style={iconAnim}>
            <CheckCircle size={18} color={colors.success} weight="fill" />
          </Animated.View>
        );
      case 'error':
      case 'rejected':
        return (
          <Animated.View style={iconAnim}>
            <XCircle size={18} color={colors.danger} weight="fill" />
          </Animated.View>
        );
      case 'running':
        return <ActivityIndicator size="small" color={colors.accent} />;
      default:
        return <Wrench size={18} color={colors.textSecondary} />;
    }
  })();

  const subtitle = (() => {
    switch (item.status) {
      case 'ok':       return item.resultSummary ?? 'Done';
      case 'error':    return item.errorMessage ?? 'Failed';
      case 'rejected': return 'Rejected';
      case 'running':  return item.requiresConfirm === false ? 'Reading local data...' : 'Running...';
      default:         return item.requiresConfirm === false ? 'Read-only local tool' : 'Awaiting your confirmation';
    }
  })();

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      layout={Layout.duration(220).damping(MOTION.settle.damping).stiffness(MOTION.settle.stiffness).mass(MOTION.settle.mass)}
      style={{ marginHorizontal: 16, marginVertical: 6 }}
    >
      <GlassPanel borderRadius={radius.card} elevated style={{ borderColor: `${accentColor}55` }}>
        <View style={{ padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accentColor}18` }}>
              {statusIcon}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                {item.preview}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                {item.name} · {subtitle}
              </Text>
            </View>
          </View>

          {item.name === 'compose_poll' && item.status !== 'rejected' && (
            <PollPreview args={item.args} accentColor={accentColor} />
          )}

          {item.status === 'pending_confirm' && item.requiresConfirm !== false && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <AnimatedPressable
                onPress={() => onReject?.(item)}
                depth="medium"
                fadeOnPress
                style={{
                  flex: 1,
                  backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.glassBorder,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
                haptic="light"
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Reject</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => onConfirm?.(item)}
                depth="deep"
                fadeOnPress
                style={{
                  flex: 1,
                  backgroundColor: colors.accent,
                  borderRadius: radius.md,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
                haptic="medium"
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Confirm</Text>
              </AnimatedPressable>
            </View>
          )}
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

// Compact preview of the poll the AI is proposing. Looks like a poll, not a debug card.
function PollPreview({ args, accentColor }: { args: any; accentColor: string }) {
  const { colors } = useTheme();
  const question = typeof args?.question === 'string' && args.question.trim()
    ? args.question
    : 'Drafting your poll…';
  const rawOptions: unknown[] = Array.isArray(args?.options) ? args.options : [];
  const options = rawOptions
    .map((o) => typeof o === 'string' ? o : (o && typeof o === 'object' && typeof (o as any).text === 'string' ? (o as any).text : ''))
    .filter(Boolean)
    .slice(0, 4);
  const duration = typeof args?.duration === 'string' ? args.duration : '24h';
  const hashtags: string[] = Array.isArray(args?.hashtags)
    ? args.hashtags.map((t: unknown) => typeof t === 'string' ? t.replace(/^#/, '') : '').filter(Boolean).slice(0, 3)
    : [];

  return (
    <View
      style={{
        marginTop: 6,
        padding: 14,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: `${accentColor}66`,
        backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
        gap: 10,
        overflow: 'hidden',
      }}
    >
      {/* Accent stripe */}
      <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, backgroundColor: accentColor }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accentColor}22` }}>
          <ChartBar color={accentColor} size={12} weight="fill" />
        </View>
        <Text style={{ color: accentColor, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>POLL</Text>
        <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textMuted, opacity: 0.5 }} />
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>{duration} window</Text>
      </View>

      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 21 }} numberOfLines={3}>
        {question}
      </Text>

      <View style={{ gap: 7 }}>
        {options.length > 0 ? options.map((opt, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 12, paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${accentColor}33`,
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            }}
          >
            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: `${accentColor}80` }} />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>{opt}</Text>
          </View>
        )) : (
          <View style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: 'italic' }}>Waiting for options…</Text>
          </View>
        )}
      </View>

      {hashtags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {hashtags.map(t => (
            <Text key={t} style={{ color: accentColor, fontSize: 11, fontWeight: '600' }}>#{t}</Text>
          ))}
        </View>
      )}
    </View>
  );
}
