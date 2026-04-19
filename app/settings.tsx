import React from 'react';
import { View, Text, Pressable, ScrollView, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, ChevronRight, Bell, Vibrate, Lock, Moon,
  Shield, Info, HelpCircle, LogOut, Trash2, Eye
} from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { supabase } from '../lib/supabase';

function SettingsRow({ icon: Icon, label, right, onPress, destructive }: {
  icon: any; label: string; right?: React.ReactNode; onPress?: () => void; destructive?: boolean;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center py-3.5 px-1">
      <View className={`w-9 h-9 rounded-lg ${destructive ? 'bg-red-900/30' : 'bg-zinc-800'} items-center justify-center mr-3`}>
        <Icon color={destructive ? '#EF4444' : '#A1A1AA'} size={18} />
      </View>
      <Text className={`text-base flex-1 ${destructive ? 'text-red-400' : 'text-white'}`}>{label}</Text>
      {right || (onPress && <ChevronRight color="#52525B" size={18} />)}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const {
    hapticEnabled, setHapticEnabled,
    notificationsEnabled, setNotificationsEnabled,
    privateAccount, setPrivateAccount,
    darkMode, setDarkMode,
    setHasSeenOnboarding, setUsername,
    blockedIds,
  } = useAppStore();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          if (isSupabaseRemote()) await supabase.auth.signOut();
          setHasSeenOnboarding(false);
          setUsername('');
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleSignOut },
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="flex-row items-center px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <Text className="text-white font-bold text-lg">Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-4 pt-4">
        {/* Notifications */}
        <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Notifications</Text>
        <View className="bg-zinc-900 rounded-2xl px-4 border border-zinc-800 mb-5">
          <SettingsRow
            icon={Bell}
            label="Push Notifications"
            right={<Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={{ false: '#3f3f46', true: '#2563EB' }} thumbColor="#fff" />}
          />
          <View className="border-b border-zinc-800" />
          <SettingsRow
            icon={Vibrate}
            label="Haptic Feedback"
            right={<Switch value={hapticEnabled} onValueChange={setHapticEnabled} trackColor={{ false: '#3f3f46', true: '#2563EB' }} thumbColor="#fff" />}
          />
        </View>

        {/* Privacy */}
        <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Privacy</Text>
        <View className="bg-zinc-900 rounded-2xl px-4 border border-zinc-800 mb-5">
          <SettingsRow
            icon={Lock}
            label="Private Account"
            right={<Switch value={privateAccount} onValueChange={setPrivateAccount} trackColor={{ false: '#3f3f46', true: '#2563EB' }} thumbColor="#fff" />}
          />
          <View className="border-b border-zinc-800" />
          <SettingsRow
            icon={Eye}
            label={`Blocked Users (${blockedIds.length})`}
            onPress={() => {}}
          />
        </View>

        {/* Appearance */}
        <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Appearance</Text>
        <View className="bg-zinc-900 rounded-2xl px-4 border border-zinc-800 mb-5">
          <SettingsRow
            icon={Moon}
            label="Dark Mode"
            right={<Switch value={darkMode} onValueChange={setDarkMode} trackColor={{ false: '#3f3f46', true: '#2563EB' }} thumbColor="#fff" />}
          />
        </View>

        {/* About */}
        <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">About</Text>
        <View className="bg-zinc-900 rounded-2xl px-4 border border-zinc-800 mb-5">
          <SettingsRow icon={Shield} label="Privacy Policy" onPress={() => {}} />
          <View className="border-b border-zinc-800" />
          <SettingsRow icon={HelpCircle} label="Help & Support" onPress={() => {}} />
          <View className="border-b border-zinc-800" />
          <SettingsRow icon={Info} label="Version" right={<Text className="text-zinc-500 text-sm">1.0.0</Text>} />
        </View>

        {/* Danger zone */}
        <View className="bg-zinc-900 rounded-2xl px-4 border border-zinc-800 mb-5">
          <SettingsRow icon={LogOut} label="Sign Out" onPress={handleSignOut} destructive />
          <View className="border-b border-zinc-800" />
          <SettingsRow icon={Trash2} label="Delete Account" onPress={handleDeleteAccount} destructive />
        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
