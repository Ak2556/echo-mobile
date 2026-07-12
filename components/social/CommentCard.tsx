import React from 'react';
import { View, Text } from 'react-native';
import { HeartStraight, SealCheck, ChatCircle } from 'phosphor-react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { Avatar } from '../ui/Avatar';
import { Comment } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useToggleRemoteCommentLike } from '../../hooks/queries/useEchoComments';

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
  indented?: boolean;
  onReply?: (c: Comment) => void;
}

export function CommentCard({ comment, echoId, indented, onReply }: CommentCardProps) {
  const { likeComment } = useAppStore();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const { colors, fontSizes, showAvatars, animation } = useTheme();
  const heartScale = useSharedValue(1);
  const remote = isSupabaseRemote();
  const toggleRemoteLike = useToggleRemoteCommentLike(echoId);

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
    if (remote) {
      toggleRemoteLike.mutate({ commentId: comment.id, like: !comment.isLiked });
    } else {
      likeComment(echoId, comment.id);
    }
  };

  return (
    <Animated.View entering={animation(FadeInDown.duration(220))} className="flex-row py-3" style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border, paddingLeft: indented ? 48 : 16, paddingRight: 16 }}>
      {showAvatars && (
        <View className="mr-3 mt-0.5">
          <Avatar
            name={comment.displayName}
            color={comment.avatarColor}
            url={comment.avatarUrl}
            size={36}
          />
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
            accessibilityLabel={comment.isLiked ? 'Unlike comment' : 'Like comment'}
            accessibilityRole="button"
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
          {!indented && (
            <AnimatedPressable className="flex-row items-center gap-1" scaleValue={0.85} haptic="light" onPress={() => onReply?.(comment)} accessibilityLabel="Reply to comment" accessibilityRole="button">
              <ChatCircle color={colors.textMuted} size={14} />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>Reply</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
}
