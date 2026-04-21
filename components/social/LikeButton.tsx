import React, { useState, useEffect } from 'react';
import { Text } from 'react-native';
import { Heart } from 'phosphor-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence, withDelay, withTiming } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useToggleRemoteLike } from '../../hooks/queries/useSupabaseSocial';
import { useAppStore } from '../../store/useAppStore';

interface LikeButtonProps {
  echoId: string;
  initialLikes: number;
  initialLiked?: boolean;
}

export function LikeButton({ echoId, initialLikes, initialLiked = false }: LikeButtonProps) {
  const remote = isSupabaseRemote();
  const qc = useQueryClient();
  const toggleLocalLike = useAppStore(s => s.toggleLike);
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const remoteMut = useToggleRemoteLike();

  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialLikes);
  const heartScale = useSharedValue(1);
  const heartRotate = useSharedValue(0);

  useEffect(() => {
    setLiked(initialLiked);
    setCount(initialLikes);
  }, [initialLiked, initialLikes, echoId]);

  const bump = (isLiking: boolean) => {
    if (isLiking) {
      // Satisfying multi-stage bounce for liking
      heartScale.value = withSequence(
        withSpring(0.6, { damping: 8, stiffness: 500 }),
        withSpring(1.3, { damping: 6, stiffness: 300 }),
        withSpring(0.95, { damping: 10, stiffness: 400 }),
        withSpring(1, { damping: 12, stiffness: 300 })
      );
      heartRotate.value = withSequence(
        withTiming(-0.15, { duration: 80 }),
        withTiming(0.15, { duration: 80 }),
        withSpring(0, { damping: 10, stiffness: 300 })
      );
      if (hapticEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      heartScale.value = withSequence(
        withSpring(0.85, { damping: 12, stiffness: 400 }),
        withSpring(1, { damping: 12, stiffness: 300 })
      );
      if (hapticEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const handlePress = () => {
    if (remote) {
      const next = !liked;
      setLiked(next);
      setCount(c => (next ? c + 1 : Math.max(0, c - 1)));
      bump(next);
      remoteMut.mutate(
        { echoId, like: next },
        { onError: () => { setLiked(!next); setCount(c => (next ? Math.max(0, c - 1) : c + 1)); } }
      );
      return;
    }
    const next = !liked;
    toggleLocalLike(echoId);
    setLiked(next);
    setCount(c => (next ? c + 1 : Math.max(0, c - 1)));
    bump(next);
    qc.invalidateQueries({ queryKey: ['feed'] });
  };

  const heartStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: heartScale.value },
      { rotate: `${heartRotate.value}rad` },
    ],
  }));

  return (
    <AnimatedPressable
      onPress={handlePress}
      className="flex-row items-center gap-2 px-3 py-2 rounded-full bg-zinc-800/60"
      scaleValue={0.92}
      haptic="none"
    >
      <Animated.View style={heartStyle}>
        <Heart
          size={22}
          color={liked ? '#EF4444' : '#A1A1AA'}
          weight={liked ? 'fill' : 'regular'}
        />
      </Animated.View>
      <Text className={`font-medium ${liked ? 'text-red-500' : 'text-zinc-400'}`}>{count}</Text>
    </AnimatedPressable>
  );
}
