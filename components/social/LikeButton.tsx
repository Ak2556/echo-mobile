import React, { useState, useEffect } from 'react';
import { HeartStraight } from 'phosphor-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { SpringCounter } from '../ui/SpringCounter';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useToggleRemoteLike } from '../../hooks/queries/useSupabaseSocial';
import { useAppStore } from '../../store/useAppStore';
import { MOTION } from '../../lib/motion';
import { track } from '../../lib/analytics';

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

  useEffect(() => {
    setLiked(initialLiked);
    setCount(initialLikes);
  }, [initialLiked, initialLikes, echoId]);

  const bump = (isLiking: boolean) => {
    if (isLiking) {
      heartScale.value = withSequence(
        withSpring(0.84, MOTION.pressFirm),
        withSpring(1, MOTION.overshoot)
      );
      if (hapticEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      heartScale.value = withSpring(1, MOTION.release);
      if (hapticEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePress = () => {
    if (remote) {
      const next = !liked;
      setLiked(next);
      setCount(c => (next ? c + 1 : Math.max(0, c - 1)));
      bump(next);
      if (next) track('echo_liked', { echo_id: echoId });
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
    if (next) track('echo_liked', { echo_id: echoId });
    qc.invalidateQueries({ queryKey: ['feed'] });
  };

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={handlePress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99 }}
      depth="medium"
      fadeOnPress
      haptic="none"
      performanceMode="hot"
      accessibilityLabel={liked ? 'Unlike' : 'Like'}
      accessibilityRole="button"
    >
      <Animated.View style={heartStyle}>
        <HeartStraight
          size={22}
          color={liked ? '#EF4444' : '#A1A1AA'}
          weight={liked ? 'fill' : 'regular'}
        />
      </Animated.View>
      <SpringCounter
        value={count}
        performanceMode="hot"
        style={{ fontWeight: '500', color: liked ? '#EF4444' : '#A1A1AA', fontSize: 14 }}
      />
    </AnimatedPressable>
  );
}
