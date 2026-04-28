import React from 'react';
import { View, Text } from 'react-native';
import { HeartStraight, SealCheck, ChatCircle } from 'phosphor-react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { Comment } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

interface CommentCardProps {
  comment: Comment;
  echoId: string;
}

export function CommentCard({ comment, echoId }: CommentCardProps) {
  const likeComment   = useAppStore(s => s.likeComment);
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const { colors, fontSizes, showAvatars, animation } = useTheme();
  const heartScale = useSharedValue(1);

  const heartAnim = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const handleLike = () => {
    heartScale.value = withSequence(
      withSpring(0.7, { damping: 8, stiffness: 500 }),
      withSpring(1.2, { damping: 8, stiffness: 300 }),
      withSpring(1, { damping: 12, stiffness: 300 })
    );
    if (hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    likeComment(echoId, comment.id);
  };

  return (
    <Animated.View entering={animation(FadeInDown.springify())} className="flex-row px-4 py-3" style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      {showAvatars && (
        <View
          className="w-9 h-9 rounded-full items-center justify-center mr-3 mt-0.5"
          style={{ backgroundColor: comment.avatarColor }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
            {comment.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View className="flex-1">
        <View className="flex-row items-center gap-1 mb-1">
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.small }}>{comment.displayName}</Text>
          {comment.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{'\u00B7'} {getTimeAgo(comment.createdAt)}</Text>
        </View>

        <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, lineHeight: fontSizes.small * 1.5 }}>{comment.content}</Text>

        <View className="flex-row items-center gap-5 mt-2">
          <AnimatedPressable
            onPress={handleLike}
            className="flex-row items-center gap-1"
            scaleValue={0.85}
            haptic="none"
          >
            <Animated.View style={heartAnim}>
              <HeartStraight
                color={comment.isLiked ? colors.danger : colors.textMuted}
                size={14}
                weight="regular"
              />
            </Animated.View>
            <Text style={{ fontSize: fontSizes.caption, color: comment.isLiked ? colors.danger : colors.textMuted }}>
              {comment.likes}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable className="flex-row items-center gap-1" scaleValue={0.85} haptic="light">
            <ChatCircle color={colors.textMuted} size={14} />
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>Reply</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Animated.View>
  );
}
