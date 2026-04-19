import React from 'react';
import { View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Settings, Bookmark, MessageSquare, ChevronRight, Bell, Vibrate, Info, LogOut, Shield,
  UserPen, Users, Mail, Sparkles,
} from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { supabase } from '../../lib/supabase';

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof MessageSquare }) {
  return (
    <View className="flex-1 bg-zinc-900 rounded-2xl p-4 items-center border border-zinc-800">
      <Icon color="#3B82F6" size={20} />
      <Text className="text-white text-2xl font-bold mt-2">{value}</Text>
      <Text className="text-zinc-400 text-xs mt-1">{label}</Text>
    </View>
  );
}

function SettingsRow({ icon: Icon, label, right, onPress }: {
  icon: typeof Settings; label: string; right?: React.ReactNode; onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center py-3.5 px-1"
    >
      <View className="w-9 h-9 rounded-lg bg-zinc-800 items-center justify-center mr-3">
        <Icon color="#A1A1AA" size={18} />
      </View>
      <Text className="text-white text-base flex-1">{label}</Text>
      {right || <ChevronRight color="#52525B" size={18} />}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
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
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(100).springify()} className="items-center pt-6 pb-4 px-4">
          <View className="w-20 h-20 rounded-full bg-blue-600 items-center justify-center mb-3">
            <Text className="text-white text-3xl font-bold">{(username || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <Text className="text-white text-2xl font-bold">@{username || 'user'}</Text>
          <Text className="text-zinc-400 text-sm mt-1">Echo member</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} className="flex-row gap-3 px-4 mb-6">
          <StatCard label="Chats" value={sessions.length} icon={MessageSquare} />
          <StatCard label="Echoes" value={publishedEchoes.length} icon={Sparkles} />
          <StatCard label="Saved" value={savedCount} icon={Bookmark} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify()} className="px-4 mb-4">
          <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">
            Account
          </Text>
          <View className="bg-zinc-900 rounded-2xl px-4 border border-zinc-800">
            <SettingsRow
              icon={UserPen}
              label="Edit profile"
              onPress={() => router.push('/edit-profile')}
            />
            <View className="border-b border-zinc-800" />
            <SettingsRow
              icon={Bookmark}
              label="Bookmarks"
              onPress={() => router.push('/bookmarks')}
            />
            <View className="border-b border-zinc-800" />
            <SettingsRow
              icon={Mail}
              label="Messages"
              onPress={() => router.push('/messages')}
            />
            <View className="border-b border-zinc-800" />
            <SettingsRow
              icon={Users}
              label="Connections"
              onPress={() => router.push({ pathname: '/followers', params: { userId, tab: 'followers' } })}
            />
            <View className="border-b border-zinc-800" />
            <SettingsRow
              icon={Settings}
              label="Settings"
              onPress={() => router.push('/settings')}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()} className="px-4">
          <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">
            Preferences
          </Text>
          <View className="bg-zinc-900 rounded-2xl px-4 border border-zinc-800 mb-4">
            <SettingsRow
              icon={Vibrate}
              label="Haptic Feedback"
              right={
                <Switch
                  value={hapticEnabled}
                  onValueChange={setHapticEnabled}
                  trackColor={{ false: '#3f3f46', true: '#2563EB' }}
                  thumbColor="#fff"
                />
              }
            />
            <View className="border-b border-zinc-800" />
            <SettingsRow
              icon={Bell}
              label="Notifications"
              right={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={{ false: '#3f3f46', true: '#2563EB' }}
                  thumbColor="#fff"
                />
              }
            />
          </View>

          <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">
            About
          </Text>
          <View className="bg-zinc-900 rounded-2xl px-4 border border-zinc-800 mb-4">
            <SettingsRow icon={Shield} label="Privacy Policy" />
            <View className="border-b border-zinc-800" />
            <SettingsRow
              icon={Info}
              label="Version"
              right={<Text className="text-zinc-500 text-sm">1.0.0</Text>}
            />
          </View>

          <Pressable
            onPress={() => { void handleSignOut(); }}
            className="bg-zinc-900 rounded-2xl px-4 py-3.5 flex-row items-center border border-zinc-800 mb-8"
          >
            <View className="w-9 h-9 rounded-lg bg-red-900/30 items-center justify-center mr-3">
              <LogOut color="#EF4444" size={18} />
            </View>
            <Text className="text-red-400 text-base font-medium">Sign Out</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
