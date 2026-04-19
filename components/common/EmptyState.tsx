import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Animated.View entering={FadeIn.duration(400)} className="flex-1 items-center justify-center px-8">
      <View className="w-16 h-16 rounded-2xl bg-zinc-900 items-center justify-center mb-4">
        <Icon color="#3B82F6" size={32} />
      </View>
      <Text className="text-white text-xl font-bold text-center mb-2">{title}</Text>
      <Text className="text-zinc-400 text-center text-base leading-6">{subtitle}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} className="mt-6 bg-blue-600 px-6 py-3 rounded-xl">
          <Text className="text-white font-semibold">{actionLabel}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
