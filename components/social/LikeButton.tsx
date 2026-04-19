import React, { useState, useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { Heart } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useToggleRemoteLike } from '../../hooks/queries/useSupabaseSocial';
import { useAppStore } from '../../store/useAppStore';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface LikeButtonProps {
  echoId: string;
  initialLikes: number;
  initialLiked?: boolean;
}

export function LikeButton({ echoId, initialLikes, initialLiked = false }: LikeButtonProps) {
  const remote = isSupabaseRemote();
  const qc = useQueryClient();
  const toggleLocalLike = useAppStore(s => s.toggleLike);
  const remoteMut = useToggleRemoteLike();

  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialLikes);
  const scale = useSharedValue(1);

  useEffect(() => {
    setLiked(initialLiked);
    setCount(initialLikes);
  }, [initialLiked, initialLikes, echoId]);

  const bump = () => {
    scale.value = withSequence(
      withSpring(0.8, { damping: 10, stiffness: 400 }),
      withSpring(1.2, { damping: 10, stiffness: 400 }),
      withSpring(1, { damping: 10, stiffness: 400 })
    );
  };

  const handlePress = () => {
    if (remote) {
      const next = !liked;
      setLiked(next);
      setCount(c => (next ? c + 1 : Math.max(0, c - 1)));
      bump();
      remoteMut.mutate(
        { echoId, like: next },
        {
          onError: () => {
            setLiked(!next);
            setCount(c => (next ? Math.max(0, c - 1) : c + 1));
          },
        }
      );
      return;
    }
    toggleLocalLike(echoId);
    setLiked(!liked);
    setCount(c => (!liked ? c + 1 : Math.max(0, c - 1)));
    bump();
    qc.invalidateQueries({ queryKey: ['feed'] });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={handlePress}
      className="flex-row items-center gap-2 px-3 py-2 rounded-full bg-zinc-900"
      style={animatedStyle}
    >
      <Heart
        size={20}
        color={liked ? '#EF4444' : '#A1A1AA'}
        fill={liked ? '#EF4444' : 'transparent'}
      />
      <Text className={`font-medium ${liked ? 'text-red-500' : 'text-zinc-400'}`}>{count}</Text>
    </AnimatedPressable>
  );
}
