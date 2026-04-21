import React from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Settings, Bookmark, MessageSquare, ChevronRight, Bell, Vibrate, Info, LogOut, Shield,
  UserPen, Users, Mail, Sparkles,
} from 'lucide-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { supabase } from '../../lib/supabase';

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof MessageSquare }) {
  const { colors, radius } = useTheme();
  return (
    <AnimatedPressable scaleValue={0.95} haptic="light" className="flex-1 p-4 items-center" style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
      <Icon color={colors.accent} size={20} />
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700', marginTop: 8 }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{label}</Text>
    </AnimatedPressable>
  );
}

function SettingsRow({ icon: Icon, label, right, onPress }: {
  icon: typeof Settings; label: string; right?: React.ReactNode; onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      className="flex-row items-center py-3.5 px-1"
      scaleValue={0.98}
      haptic="light"
    >
      <View className="w-9 h-9 rounded-lg items-center justify-center mr-3" style={{ backgroundColor: colors.surfaceHover }}>
        <Icon color={colors.textSecondary} size={18} />
      </View>
      <Text style={{ color: colors.text, fontSize: 16, flex: 1 }}>{label}</Text>
      {right || <ChevronRight color={colors.textMuted} size={18} />}
    </AnimatedPressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, radius, switchTrack, animation } = useTheme();
  const {
    userId,
    username, sessions, bookmarkedIds, publishedEchoes,
    hapticEnabled, setHapticEnabled, notificationsEnabled, setNotificationsEnabled,
    setHasSeenOnboarding, setUsername,
  } = useAppStore();

  const handleSignOut = async () => {
    if (isSupabaseRemote()) {
      await supabase.auth.signOut();
    }
    setHasSeenOnboarding(false);
    setUsername('');
    router.replace('/onboarding');
  };

  const savedCount = bookmarkedIds.length;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={animation(FadeInDown.delay(100).springify())} className="items-center pt-6 pb-4 px-4">
          <AnimatedPressable scaleValue={0.93} haptic="light">
            <View className="w-20 h-20 rounded-full items-center justify-center mb-3" style={{ backgroundColor: colors.accent }}>
              <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700' }}>{(username || '?').charAt(0).toUpperCase()}</Text>
            </View>
          </AnimatedPressable>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>@{username || 'user'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 4 }}>Echo member</Text>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(200).springify())} className="flex-row gap-3 px-4 mb-6">
          <StatCard label="Chats" value={sessions.length} icon={MessageSquare} />
          <StatCard label="Echoes" value={publishedEchoes.length} icon={Sparkles} />
          <StatCard label="Saved" value={savedCount} icon={Bookmark} />
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(250).springify())} className="px-4 mb-4">
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>Account</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }} className="px-4">
            <SettingsRow icon={UserPen} label="Edit profile" onPress={() => router.push('/edit-profile')} />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow icon={Bookmark} label="Bookmarks" onPress={() => router.push('/bookmarks')} />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow icon={Mail} label="Messages" onPress={() => router.push('/messages')} />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow icon={Users} label="Connections" onPress={() => router.push({ pathname: '/followers', params: { userId, tab: 'followers' } })} />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow icon={Settings} label="Settings" onPress={() => router.push('/settings')} />
          </View>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(300).springify())} className="px-4">
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>Preferences</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }} className="px-4 mb-4">
            <SettingsRow
              icon={Vibrate}
              label="Haptic Feedback"
              right={
                <Switch
                  value={hapticEnabled}
                  onValueChange={setHapticEnabled}
                  trackColor={switchTrack}
                  thumbColor="#fff"
                />
              }
            />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow
              icon={Bell}
              label="Notifications"
              right={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={switchTrack}
                  thumbColor="#fff"
                />
              }
            />
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>About</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }} className="px-4 mb-4">
            <SettingsRow icon={Shield} label="Privacy Policy" />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow
              icon={Info}
              label="Version"
              right={<Text style={{ color: colors.textMuted, fontSize: 14 }}>1.0.0</Text>}
            />
          </View>

          <AnimatedPressable
            onPress={() => { void handleSignOut(); }}
            className="px-4 py-3.5 flex-row items-center mb-8"
            style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}
            scaleValue={0.97}
            haptic="medium"
          >
            <View className="w-9 h-9 rounded-lg items-center justify-center mr-3" style={{ backgroundColor: colors.dangerMuted }}>
              <LogOut color={colors.danger} size={18} />
            </View>
            <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '500' }}>Sign Out</Text>
          </AnimatedPressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
