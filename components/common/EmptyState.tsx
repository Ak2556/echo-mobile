import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../lib/theme';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const { colors, radius, animation } = useTheme();

  return (
    <Animated.View entering={animation(FadeIn.duration(400))} className="flex-1 items-center justify-center px-8">
      <View className="w-16 h-16 items-center justify-center mb-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg }}>
        <Icon color={colors.accent} size={32} />
      </View>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>{title}</Text>
      <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 16, lineHeight: 24 }}>{subtitle}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} className="mt-6 px-6 py-3" style={{ backgroundColor: colors.accent, borderRadius: radius.lg }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{actionLabel}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
