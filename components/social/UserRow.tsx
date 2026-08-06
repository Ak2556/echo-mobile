import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SealCheck } from 'phosphor-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import { Avatar } from '../ui/Avatar';
import { showToast } from '../ui/Toast';
import { User } from '../../types';
import { useFollow } from '../../hooks/queries/useFollow';
import { useTheme } from '../../lib/theme';
import { track } from '../../lib/analytics';
import { ttx } from '../../lib/i18n';

interface UserRowProps {
  user: User;
  onPress?: () => void;
  showFollowButton?: boolean;
  /** Override the default follow handler (e.g. to use a remote mutation) */
  onFollowPress?: () => void;
  /** Controlled follow state (remote lists). Falls back to the local store. */
  following?: boolean;
  /** This user follows the viewer — drives "Follow back" + the badge. */
  followsYou?: boolean;
  /** Show the "Follows you" badge (suppress where it'd be redundant, e.g. your
   *  own followers list where everyone follows you). Default true. */
  showFollowsYouBadge?: boolean;
  /** Disable the button while a follow mutation is in flight. */
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
        withSpring(0.85, { damping: 10, stiffness: 400 }),
        withSpring(1.05, { damping: 10, stiffness: 300 }),
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
              paddingHorizontal: 18,
              paddingVertical: 8,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy ? 0.6 : 1,
              backgroundColor: isFollowingState ? colors.surfaceHover : colors.accent,
              borderWidth: isFollowingState ? StyleSheet.hairlineWidth : 0,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: fontSizes.small, fontWeight: '700', color: isFollowingState ? colors.text : '#fff' }}>
              {isFollowingState ? 'Following' : followsYou ? 'Follow back' : 'Follow'}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </Pressable>
  );
}
