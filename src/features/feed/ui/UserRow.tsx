import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SealCheck } from 'phosphor-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import { Avatar } from '../../../../components/ui/Avatar';
import { showToast } from '../../../../components/ui/Toast';
import { User } from '../../../../types/index';
import { useFollow } from '../../../../hooks/queries/useFollow';
import { useTheme } from '../../../shared/lib/theme';
import { track } from '../../../shared/lib/analytics';
import { ttx } from '../../../shared/lib/i18n';
import { personName } from '../../../../lib/personName';

interface UserRowProps {
  user: User;
  onPress?: () => void;
  showFollowButton?: boolean;
  onFollowPress?: () => void;
  following?: boolean;
  followsYou?: boolean;
  showFollowsYouBadge?: boolean;
  followBusy?: boolean;
}

export function UserRow({
  user, onPress, showFollowButton = false, onFollowPress,
  following, followsYou = false, showFollowsYouBadge = true, followBusy = false,
}: UserRowProps) {
  const router = useRouter();
  const { isFollowing: hookIsFollowing, toggle, pendingId } = useFollow();
  const { colors, fontSizes, showAvatars, reduceAnimations } = useTheme();
  const isFollowingState = following !== undefined ? following : hookIsFollowing(user.id);
  const busy = followBusy || pendingId === user.id;
  const btnScale = useSharedValue(1);

  const btnAnim = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handleFollow = () => {
    if (!reduceAnimations) {
      btnScale.value = withSequence(
        withSpring(0.9, { damping: 10, stiffness: 400 }),
        withSpring(1.02, { damping: 10, stiffness: 300 }),
        withSpring(1, { damping: 12, stiffness: 300 })
      );
    }
    if (!isFollowingState) track('user_followed', { user_id: user.id });
    if (onFollowPress) {
      onFollowPress();
    } else {
      toggle(user.id);
      showToast(!isFollowingState ? `Following @${user.username}` : `Unfollowed @${user.username}`, !isFollowingState ? 'Following' : '');
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
        paddingVertical: 10,
        backgroundColor: 'transparent',
      }}
    >
      {showAvatars && (
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); openProfile(); }}
          accessibilityRole="button"
          accessibilityLabel={`Open ${personName(user)}'s profile`}
          style={{ marginRight: 12 }}
        >
          <Avatar
            name={user.displayName || user.username}
            color={user.avatarColor}
            url={user.avatarUrl}
            size={42}
            zoomable={false}
          />
        </Pressable>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body, letterSpacing: -0.2 }} numberOfLines={1}>{personName(user)}</Text>
          {user.isVerified && <SealCheck color={colors.accent} size={16} weight="fill" />}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }} numberOfLines={1}>@{user.username}</Text>
        {followsYou && showFollowsYouBadge && (
          <View style={{ alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.surfaceHover }}>
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption - 1, fontWeight: '600' }}>{ttx("Follows you")}</Text>
          </View>
        )}
        {user.bio ? (
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, marginTop: 2 }} numberOfLines={1}>{user.bio}</Text>
        ) : null}
      </View>

      {showFollowButton && (
        <Animated.View style={btnAnim}>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); handleFollow(); }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={isFollowingState ? `Unfollow ${user.username}` : `Follow ${user.username}`}
            style={{
              marginLeft: 12,
              paddingHorizontal: 16,
              paddingVertical: 7,
              borderRadius: 20,
              minWidth: 84,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy ? 0.6 : 1,
              backgroundColor: isFollowingState ? colors.surfaceHover : colors.text,
            }}
          >
            <Text style={{ fontSize: fontSizes.small, fontWeight: '800', color: isFollowingState ? colors.text : colors.bg }}>
              {isFollowingState ? 'Following' : followsYou ? 'Follow back' : 'Follow'}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </Pressable>
  );
}
