import React from 'react';
import { View, Text, Alert } from 'react-native';
import { ResponsiveScreen } from '../components/ui/ResponsiveScreen';
import { FlashList } from '@shopify/flash-list';
import { ShieldSlash } from 'phosphor-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/common/EmptyState';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../src/shared/lib/theme';
import { User } from '../types';
import { ttx } from '../src/shared/lib/i18n';
import { personName } from '../lib/personName';

export default function BlockedUsersScreen() {
  const { blockedIds, toggleBlock, getUser } = useAppStore();
  const { colors, radius, fontSizes, animation, showAvatars } = useTheme();

  const blockedUsers = blockedIds
    .map(id => getUser(id))
    .filter(Boolean) as User[];

  const handleUnblock = (user: User) => {
    Alert.alert(
      'Unblock User',
      `Unblock @${user.username}? They will be able to see your content and contact you again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: () => {
            toggleBlock(user.id);
            showToast(`Unblocked @${user.username}`, 'Done');
          },
        },
      ]
    );
  };

  return (
    <ResponsiveScreen>
      <ScreenHeader
        title={ttx("Blocked Users")}
        right={<Text style={{ color: colors.textMuted, fontSize: fontSizes.small, marginRight: 8 }}>{blockedUsers.length}</Text>}
      />

      {blockedUsers.length === 0 ? (
        <EmptyState
          icon={<ShieldSlash color="#6366F1" size={32} />}
          title={ttx("No blocked users")}
          subtitle={ttx("Users you block won't be able to see your content or contact you.")}
        />
      ) : (
        <FlashList 
          data={blockedUsers}
            renderItem={({ item, index }) => (
            <Animated.View entering={animation(FadeInDown.delay(index * 50).duration(220))}>
              <View
                className="flex-row items-center px-4 py-3.5"
                style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                {showAvatars && (
                  <View className="mr-3">
                    <Avatar name={personName(item)} color={item.avatarColor} url={item.avatarUrl} size={44} />
                  </View>
                )}
                <View className="flex-1">
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.body }}>{personName(item)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>@{item.username}</Text>
                </View>
                <AnimatedPressable
                  onPress={() => handleUnblock(item)}
                  className="px-4 py-2"
                  style={{
                    borderRadius: radius.lg,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                  scaleValue={0.93}
                  haptic="medium"
                >
                  <Text style={{ color: colors.danger, fontSize: fontSizes.small, fontWeight: '600' }}>{ttx("Unblock")}</Text>
                </AnimatedPressable>
              </View>
            </Animated.View>
          )}
          keyExtractor={item => item.id}
        />
      )}
    </ResponsiveScreen>
  );
}
