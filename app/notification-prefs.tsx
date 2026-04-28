import React from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft, HeartStraight, ChatCircle, UserPlus, ArrowsClockwise,
  AtSign, Envelope, SpeakerHigh, Bell,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';

export default function NotificationPrefsScreen() {
  const router = useRouter();
  const { colors, radius, fontSizes, switchTrack, animation } = useTheme();
  const notificationsEnabled   = useAppStore(s => s.notificationsEnabled);
  const setNotificationsEnabled = useAppStore(s => s.setNotificationsEnabled);
  const notifyLikes            = useAppStore(s => s.notifyLikes);
  const setNotifyLikes         = useAppStore(s => s.setNotifyLikes);
  const notifyComments         = useAppStore(s => s.notifyComments);
  const setNotifyComments      = useAppStore(s => s.setNotifyComments);
  const notifyFollows          = useAppStore(s => s.notifyFollows);
  const setNotifyFollows       = useAppStore(s => s.setNotifyFollows);
  const notifyDMs              = useAppStore(s => s.notifyDMs);
  const setNotifyDMs           = useAppStore(s => s.setNotifyDMs);
  const notifyReposts          = useAppStore(s => s.notifyReposts);
  const setNotifyReposts       = useAppStore(s => s.setNotifyReposts);
  const notifyMentions         = useAppStore(s => s.notifyMentions);
  const setNotifyMentions      = useAppStore(s => s.setNotifyMentions);
  const soundEnabled           = useAppStore(s => s.soundEnabled);
  const setSoundEnabled        = useAppStore(s => s.setSoundEnabled);
  const hapticEnabled          = useAppStore(s => s.hapticEnabled);
  const setHapticEnabled       = useAppStore(s => s.setHapticEnabled);

  const ToggleRow = ({ icon: Icon, iconColor, label, subtitle, value, onValueChange }: {
    icon: any; iconColor: string; label: string; subtitle?: string;
    value: boolean; onValueChange: (v: boolean) => void;
  }) => (
    <View className="flex-row items-center py-3.5 px-1">
      <View
        className="w-9 h-9 items-center justify-center mr-3"
        style={{ borderRadius: radius.md, backgroundColor: colors.surfaceHover }}
      >
        <Icon color={iconColor} size={18} />
      </View>
      <View className="flex-1 mr-3">
        <Text style={{ color: colors.text, fontSize: fontSizes.body }}>{label}</Text>
        {subtitle && <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={switchTrack}
        thumbColor="#fff"
      />
    </View>
  );

  const divider = <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} className="p-1 mr-3" scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Notification Preferences</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-4 pt-4">
        <Animated.View entering={animation(FadeInDown.delay(50).springify())}>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>General</Text>
          <View
            className="px-4 mb-5"
            style={{
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ToggleRow
              icon={Bell}
              iconColor={colors.accent}
              label="Push Notifications"
              subtitle="Master toggle for all notifications"
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
            />
          </View>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(100).springify())} style={{ opacity: notificationsEnabled ? 1 : 0.4 }} pointerEvents={notificationsEnabled ? 'auto' : 'none'}>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>Activity Types</Text>
          <View
            className="px-4 mb-5"
            style={{
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ToggleRow icon={HeartStraight} iconColor={colors.danger} label="Likes" subtitle="When someone likes your echo" value={notifyLikes} onValueChange={setNotifyLikes} />
            {divider}
            <ToggleRow icon={ChatCircle} iconColor={colors.accent} label="Comments" subtitle="When someone comments on your echo" value={notifyComments} onValueChange={setNotifyComments} />
            {divider}
            <ToggleRow icon={UserPlus} iconColor={colors.success} label="New Followers" subtitle="When someone follows you" value={notifyFollows} onValueChange={setNotifyFollows} />
            {divider}
            <ToggleRow icon={Envelope} iconColor={colors.accent} label="Direct Messages" subtitle="When you receive a new message" value={notifyDMs} onValueChange={setNotifyDMs} />
            {divider}
            <ToggleRow icon={ArrowsClockwise} iconColor={colors.accent} label="Re-echoes" subtitle="When someone re-echoes your post" value={notifyReposts} onValueChange={setNotifyReposts} />
            {divider}
            <ToggleRow icon={AtSign} iconColor={colors.accent} label="Mentions" subtitle="When someone mentions you" value={notifyMentions} onValueChange={setNotifyMentions} />
          </View>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(150).springify())}>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>Feedback</Text>
          <View
            className="px-4 mb-5"
            style={{
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ToggleRow icon={SpeakerHigh} iconColor={colors.textSecondary} label="Sound Effects" subtitle="Play sounds for notifications and actions" value={soundEnabled} onValueChange={setSoundEnabled} />
            {divider}
            <ToggleRow icon={Bell} iconColor={colors.textSecondary} label="Haptic Feedback" subtitle="Vibration feedback on interactions" value={hapticEnabled} onValueChange={setHapticEnabled} />
          </View>
        </Animated.View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
