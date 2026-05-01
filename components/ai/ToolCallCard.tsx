import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { CheckCircle, XCircle, Wrench } from 'phosphor-react-native';
import Animated, { FadeIn, Layout, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
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
  }, [item.status]);

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
      layout={Layout.springify().damping(MOTION.settle.damping).stiffness(MOTION.settle.stiffness).mass(MOTION.settle.mass)}
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
