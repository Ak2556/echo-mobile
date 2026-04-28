import React from 'react';
import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, ShieldSlash, UserMinus } from 'phosphor-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { EmptyState } from '../components/common/EmptyState';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { User } from '../types';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const blockedIds  = useAppStore(s => s.blockedIds);
  const toggleBlock = useAppStore(s => s.toggleBlock);
  const getUser     = useAppStore(s => s.getUser);
  const users       = useAppStore(s => s.users);
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
            showToast(`Unblocked @${user.username}`, '');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} className="p-1 mr-3" scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Blocked Users</Text>
        <View className="flex-1" />
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>{blockedUsers.length}</Text>
      </View>

      {blockedUsers.length === 0 ? (
        <EmptyState
          icon={<ShieldSlash color="#6366F1" size={32} />}
          title="No blocked users"
          subtitle="Users you block won't be able to see your content or contact you."
        />
      ) : (
        <FlashList
          data={blockedUsers}
          renderItem={({ item, index }: { item: User; index: number }) => (
            <Animated.View entering={animation(FadeInDown.delay(index * 50).springify())}>
              <View
                className="flex-row items-center px-4 py-3.5"
                style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                {showAvatars && (
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: item.avatarColor }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.body }}>
                      {item.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.body }}>{item.displayName}</Text>
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
                  <Text style={{ color: colors.danger, fontSize: fontSizes.small, fontWeight: '600' }}>Unblock</Text>
                </AnimatedPressable>
              </View>
            </Animated.View>
          )}
          keyExtractor={(item: User) => item.id}
        />
      )}
    </SafeAreaView>
  );
}
