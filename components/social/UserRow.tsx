import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SealCheck } from 'phosphor-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import { Avatar } from '../ui/Avatar';
import { showToast } from '../ui/Toast';
import { User } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { track } from '../../lib/analytics';

interface UserRowProps {
  user: User;
  onPress?: () => void;
  showFollowButton?: boolean;
  /** Override the default follow handler (e.g. to use a remote mutation) */
  onFollowPress?: () => void;
}

export function UserRow({ user, onPress, showFollowButton = false, onFollowPress }: UserRowProps) {
  const router = useRouter();
  const { isFollowing, toggleFollow } = useAppStore();
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
    if (!following) track('user_followed', { user_id: user.id });
    if (onFollowPress) {
      onFollowPress();
    } else {
      toggleFollow(user.id);
      showToast(!following ? `Following @${user.username}` : `Unfollowed @${user.username}`, !following ? 'Following' : '');
    }
  };
  const openProfile = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push(`/user/${user.id}`);
  };

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      {showAvatars && (
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); openProfile(); }}
          accessibilityRole="button"
          accessibilityLabel={`Open ${user.displayName}'s profile`}
          style={{ marginRight: 12 }}
        >
          <Avatar
            name={user.displayName || user.username}
            color={user.avatarColor}
            url={user.avatarUrl}
            size={44}
            zoomable={false}
          />
        </Pressable>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.body }} numberOfLines={1}>{user.displayName}</Text>
          {user.isVerified && <SealCheck color={colors.accent} size={16} weight="fill" />}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }} numberOfLines={1}>@{user.username}</Text>
        {user.bio ? (
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, marginTop: 2 }} numberOfLines={1}>{user.bio}</Text>
        ) : null}
      </View>

      {showFollowButton && (
        <Animated.View style={btnAnim}>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); handleFollow(); }}
            accessibilityRole="button"
            accessibilityLabel={following ? `Unfollow ${user.username}` : `Follow ${user.username}`}
            style={{
              marginLeft: 12,
              paddingHorizontal: 18,
              paddingVertical: 8,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: following ? colors.surfaceHover : colors.accent,
              borderWidth: following ? StyleSheet.hairlineWidth : 0,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: fontSizes.small, fontWeight: '700', color: following ? colors.text : '#fff' }}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </Pressable>
  );
}
