import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '../../lib/theme';
import { MOTION } from '../../lib/motion';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
  style?: any;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, className, style }: SkeletonProps) {
  const { colors, reduceAnimations } = useTheme();
  const shimmer = useSharedValue(0.4);

  useEffect(() => {
    if (reduceAnimations) {
      shimmer.value = 0.5;
      return;
    }
    // Asymmetric spring pulse: snap bright, decay slow — feels organic vs linear bezier
    shimmer.value = withRepeat(
      withSequence(
        withSpring(0.92, MOTION.snap),
        withSpring(0.32, { damping: 28, stiffness: 240, mass: 1.2 })
      ),
      -1,
      false
    );
  }, [reduceAnimations]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value,
  }));

  return (
    <Animated.View
      className={className}
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.surfaceHover,
        },
        animStyle,
        style,
      ]}
    />
  );
}

export function FeedCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}>
      {/* Author row */}
      <View className="flex-row items-center mb-3">
        <Skeleton width={36} height={36} borderRadius={18} />
        <View className="ml-3 flex-1">
          <Skeleton width={120} height={14} className="mb-1.5" />
          <Skeleton width={80} height={12} />
        </View>
        <Skeleton width={30} height={12} />
      </View>
      {/* Prompt */}
      <View style={{ backgroundColor: colors.surfaceHover, borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <Skeleton width={50} height={10} className="mb-2" />
        <Skeleton width="90%" height={14} className="mb-1" />
        <Skeleton width="60%" height={14} />
      </View>
      {/* Response */}
      <View className="mb-3">
        <Skeleton width={40} height={10} className="mb-2" />
        <Skeleton width="100%" height={14} className="mb-1" />
        <Skeleton width="85%" height={14} className="mb-1" />
        <Skeleton width="40%" height={14} />
      </View>
      {/* Actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Skeleton width={70} height={32} borderRadius={16} />
        <View className="flex-row gap-4">
          <Skeleton width={20} height={20} borderRadius={10} />
          <Skeleton width={20} height={20} borderRadius={10} />
          <Skeleton width={20} height={20} borderRadius={10} />
          <Skeleton width={20} height={20} borderRadius={10} />
        </View>
      </View>
    </View>
  );
}

export function NotificationSkeleton() {
  return (
    <View className="flex-row items-center px-4 py-3">
      <Skeleton width={40} height={40} borderRadius={20} />
      <View className="ml-3 flex-1">
        <Skeleton width="70%" height={14} className="mb-1.5" />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

export function UserRowSkeleton() {
  return (
    <View className="flex-row items-center px-4 py-3">
      <Skeleton width={44} height={44} borderRadius={22} />
      <View className="ml-3 flex-1">
        <Skeleton width={100} height={14} className="mb-1.5" />
        <Skeleton width={140} height={12} />
      </View>
      <Skeleton width={80} height={32} borderRadius={16} />
    </View>
  );
}
