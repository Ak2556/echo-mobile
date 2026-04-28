import React from 'react';
import { View, Text } from 'react-native';
import { SealCheck } from 'phosphor-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { showToast } from '../ui/Toast';
import { User } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';

interface UserRowProps {
  user: User;
  onPress?: () => void;
  showFollowButton?: boolean;
}

export function UserRow({ user, onPress, showFollowButton = false }: UserRowProps) {
  const isFollowing   = useAppStore(s => s.isFollowing);
  const toggleFollow  = useAppStore(s => s.toggleFollow);
  const { colors, fontSizes, showAvatars, reduceAnimations } = useTheme();
  const following = isFollowing(user.id);
  const btnScale = useSharedValue(1);

  const btnAnim = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handleFollow = () => {
    if (!reduceAnimations) {
      btnScale.value = withSequence(
        withSpring(0.85, { damping: 10, stiffness: 400 }),
        withSpring(1.05, { damping: 10, stiffness: 300 }),
        withSpring(1, { damping: 12, stiffness: 300 })
      );
    }
    toggleFollow(user.id);
    showToast(!following ? `Following @${user.username}` : `Unfollowed @${user.username}`, !following ? '\u{1F91D}' : '');
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      className="flex-row items-center px-4 py-3"
      style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border }}
      scaleValue={0.98}
      haptic="light"
    >
      {showAvatars && (
        <View
          className="w-11 h-11 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: user.avatarColor }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.body }}>
            {user.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View className="flex-1">
        <View className="flex-row items-center gap-1">
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.body }}>{user.displayName}</Text>
          {user.isVerified && <SealCheck color={colors.accent} size={16} weight="fill" />}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>@{user.username}</Text>
        {user.bio ? (
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, marginTop: 2 }} numberOfLines={1}>{user.bio}</Text>
        ) : null}
      </View>

      {showFollowButton && (
        <Animated.View style={btnAnim}>
          <AnimatedPressable
            onPress={(e) => { e.stopPropagation?.(); handleFollow(); }}
            className="px-4 py-1.5 rounded-full"
            style={{
              backgroundColor: following ? colors.surfaceHover : '#fff',
              borderWidth: following ? 1 : 0,
              borderColor: colors.border,
            }}
            scaleValue={0.92}
            haptic="medium"
          >
            <Text style={{ fontSize: fontSizes.small, fontWeight: '600', color: following ? colors.text : '#000' }}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </AnimatedPressable>
        </Animated.View>
      )}
    </AnimatedPressable>
  );
}
