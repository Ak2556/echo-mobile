import React from 'react';
import { View, Text } from 'react-native';
import { ResponsiveScreen } from '../components/ui/ResponsiveScreen';
import { FlashList } from '@shopify/flash-list';
import { SpeakerSlash } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import Animated from 'react-native-reanimated';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/common/EmptyState';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/ui/theme';
import { User } from '../types';
import { ttx } from '../lib/i18n/i18n';
import { personName } from '../lib/social/personName';
import { BRAND } from '../lib/ui/fixedColors';

export default function MutedUsersScreen() {
  const { mutedIds, toggleMute, getUser } = useAppStore();
  const { colors, radius, fontSizes, showAvatars } = useTheme();

  const mutedUsers = mutedIds
    .map(id => getUser(id))
    .filter(Boolean) as User[];

  return (
    <ResponsiveScreen>
      <ScreenHeader
        title={ttx("Muted Users")}
        right={<Text style={{ color: colors.textMuted, fontSize: fontSizes.small, marginRight: 8 }}>{mutedUsers.length}</Text>}
      />

      {mutedUsers.length === 0 ? (
        <EmptyState
          icon={<SpeakerSlash color={BRAND.indigo} size={32} />}
          title={ttx("No muted users")}
          subtitle={ttx("Muting hides their echoes from your feed but doesn't notify them.")}
        />
      ) : (
        <FlashList 
          data={mutedUsers}
            renderItem={({ item, index }) => (
            <Animated.View>
              <View
                style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              >
                {showAvatars && (
                  <View style={{ marginRight: 12 }}>
                    <Avatar name={personName(item)} color={item.avatarColor} url={item.avatarUrl} size={44} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.body }}>{personName(item)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>@{item.username}</Text>
                </View>
                <AnimatedPressable
                  onPress={() => { toggleMute(item.id); showToast(`Unmuted @${item.username}`, ''); }}
                  style={[{ paddingHorizontal: 16, paddingVertical: 8 }, {
                    borderRadius: radius.lg,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }]}
                  scaleValue={0.93}
                  haptic="medium"
                >
                  <Text style={{ color: colors.text, fontSize: fontSizes.small, fontWeight: '600' }}>{ttx("Unmute")}</Text>
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
