import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { CheckCircle, XCircle, Wrench } from 'phosphor-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';

export type ToolCallStatus = 'pending_confirm' | 'running' | 'ok' | 'error' | 'rejected';

export interface ToolCallItem {
  id: string;
  name: string;
  preview: string;
  status: ToolCallStatus;
  args: any;
  resultSummary?: string;
  errorMessage?: string;
}

interface Props {
  item: ToolCallItem;
  onConfirm?: (item: ToolCallItem) => void;
  onReject?: (item: ToolCallItem) => void;
}

export function ToolCallCard({ item, onConfirm, onReject }: Props) {
  const { colors } = useTheme();

  const statusIcon = (() => {
    switch (item.status) {
      case 'ok':
        return <CheckCircle size={18} color={colors.accent} weight="fill" />;
      case 'error':
      case 'rejected':
        return <XCircle size={18} color={colors.danger} weight="fill" />;
      case 'running':
        return <ActivityIndicator size="small" color={colors.accent} />;
      default:
        return <Wrench size={18} color={colors.textSecondary} />;
    }
  })();

  const subtitle = (() => {
    switch (item.status) {
      case 'ok':
        return item.resultSummary ?? 'Done';
      case 'error':
        return item.errorMessage ?? 'Failed';
      case 'rejected':
        return 'Rejected';
      case 'running':
        return 'Running…';
      default:
        return 'Awaiting your confirmation';
    }
  })();

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={{ marginHorizontal: 16, marginVertical: 6 }}
    >
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 12,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {statusIcon}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
              {item.preview}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {item.name} · {subtitle}
            </Text>
          </View>
        </View>

        {item.status === 'pending_confirm' && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <AnimatedPressable
              onPress={() => onReject?.(item)}
              style={{
                flex: 1,
                backgroundColor: colors.bg,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingVertical: 8,
                alignItems: 'center',
              }}
              haptic="light"
            >
              <Text style={{ color: colors.text, fontWeight: '600' }}>Reject</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => onConfirm?.(item)}
              style={{
                flex: 1,
                backgroundColor: colors.accent,
                borderRadius: 10,
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
    </Animated.View>
  );
}
