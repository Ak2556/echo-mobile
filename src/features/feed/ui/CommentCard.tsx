import React from 'react';
import { View, Text } from 'react-native';
import { HeartStraight, SealCheck, ChatCircle } from 'phosphor-react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../../../../components/ui/AnimatedPressable';
import { Avatar } from '../../../../components/ui/Avatar';
import { SpeakButton } from '../../../../components/ui/SpeakButton';
import { Comment } from '../../../../types/index';
import { useAppStore } from '../../../../store/useAppStore';
import { useTheme } from '../../../shared/lib/theme';
import { isSupabaseRemote } from '../../../../lib/remoteConfig';
import { useToggleRemoteCommentLike } from '../../../../hooks/queries/useEchoComments';
import { ttx } from '../../../shared/lib/i18n';

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

/** 14pt glyphs with 15pt of slop clear Apple's 44pt minimum. */
const ACTION_HIT_SLOP = { top: 15, bottom: 15, left: 10, right: 10 };

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
    <Animated.View
      entering={animation(FadeInDown.duration(220))}
      style={{
        flexDirection: 'row',
        // These were Tailwind classes (`flex-row py-3`), but this file lives in
        // src/ and tailwind.config only scans ./app and ./components — so none
        // of the utilities on this card ever generated a style. The spacing the
        // code appeared to specify was never actually applied, which is why the
        // row read as cramped.
        paddingVertical: 14,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        paddingLeft: indented ? 52 : 16,
        paddingRight: 16,
      }}
    >
      {showAvatars && (
        <View style={{ marginRight: 12, marginTop: 2 }}>
          <Avatar
            name={comment.displayName}
            color={comment.avatarColor}
            url={comment.avatarUrl}
            size={36}
          />
        </View>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.small }}>{comment.displayName}</Text>
          {comment.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{'\u00B7'} {getTimeAgo(comment.createdAt)}</Text>
        </View>

        <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, lineHeight: fontSizes.small * 1.55 }}>{comment.content}</Text>

        {/* Actions sit apart on purpose. They read as a quiet caption rather
            than a toolbar, but each needs room to be aimed at: 24pt between
            them, and padding inside each so the tappable area is real rather
            than only hitSlop. Layout stays on an inner View because box props
            on a touchable's own style get dropped in release builds. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 10 }}>
          <AnimatedPressable
            onPress={handleLike}
            scaleValue={0.85}
            haptic="none"
            hitSlop={ACTION_HIT_SLOP}
            accessibilityLabel={comment.isLiked ? 'Unlike comment' : 'Like comment'}
            accessibilityRole="button"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
              <Animated.View style={heartAnim}>
                <HeartStraight
                  color={comment.isLiked ? colors.danger : colors.textMuted}
                  size={16}
                  weight="regular"
                />
              </Animated.View>
              <Text style={{ fontSize: fontSizes.caption, color: comment.isLiked ? colors.danger : colors.textMuted }}>
                {comment.likes}
              </Text>
            </View>
          </AnimatedPressable>
          {!indented && (
            <AnimatedPressable scaleValue={0.85} haptic="light" hitSlop={ACTION_HIT_SLOP} onPress={() => onReply?.(comment)} accessibilityLabel={ttx("Reply to comment")} accessibilityRole="button">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                <ChatCircle color={colors.textMuted} size={16} />
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{ttx("Reply")}</Text>
              </View>
            </AnimatedPressable>
          )}
          <SpeakButton text={comment.content} id={`comment:${comment.id}`} size={16} hitSlop={15} />
        </View>
      </View>
    </Animated.View>
  );
}
