import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, SpeakerSlash } from 'phosphor-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/common/EmptyState';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { User } from '../types';

export default function MutedUsersScreen() {
  const router = useRouter();
  const { mutedIds, toggleMute, getUser } = useAppStore();
  const { colors, radius, fontSizes, animation, showAvatars } = useTheme();

  const mutedUsers = mutedIds
    .map(id => getUser(id))
    .filter(Boolean) as User[];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} className="p-1 mr-3" scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Muted Users</Text>
        <View className="flex-1" />
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>{mutedUsers.length}</Text>
      </View>

      {mutedUsers.length === 0 ? (
        <EmptyState
          icon={<SpeakerSlash color="#6366F1" size={32} />}
          title="No muted users"
          subtitle="Muting hides their echoes from your feed but doesn't notify them."
        />
      ) : (
        <FlashList
          data={mutedUsers}
          renderItem={({ item, index }) => (
            <Animated.View entering={animation(FadeInDown.delay(index * 50).duration(220))}>
              <View
                className="flex-row items-center px-4 py-3.5"
                style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                {showAvatars && (
                  <View className="mr-3">
                    <Avatar name={item.displayName} color={item.avatarColor} url={item.avatarUrl} size={44} />
                  </View>
                )}
                <View className="flex-1">
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.body }}>{item.displayName}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>@{item.username}</Text>
                </View>
                <AnimatedPressable
                  onPress={() => { toggleMute(item.id); showToast(`Unmuted @${item.username}`, ''); }}
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
                  <Text style={{ color: colors.text, fontSize: fontSizes.small, fontWeight: '600' }}>Unmute</Text>
                </AnimatedPressable>
              </View>
            </Animated.View>
          )}
          keyExtractor={item => item.id}
        />
      )}
    </SafeAreaView>
  );
}
