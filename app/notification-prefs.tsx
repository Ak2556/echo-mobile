import React from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { ResponsiveScreen } from '../components/ui/ResponsiveScreen';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  HeartStraight, ChatCircle, UserPlus, ArrowsClockwise,
  Quotes, Envelope, SpeakerHigh, Bell,
} from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/ui/theme';
import { showToast } from '../components/ui/Toast';
import { clearPushToken, registerForPush } from '../lib/notifications/push';
import { syncNotificationPrefs } from '../lib/notifications/prefsSync';
import { ttx } from '../lib/i18n/i18n';
import { SWITCH_THUMB } from '../lib/ui/fixedColors';

export default function NotificationPrefsScreen() {
  const { colors, radius, fontSizes, switchTrack, animation } = useTheme();
  const {
    notificationsEnabled, setNotificationsEnabled,
    notifyLikes, setNotifyLikes,
    notifyComments, setNotifyComments,
    notifyFollows, setNotifyFollows,
    notifyDMs, setNotifyDMs,
    notifyReposts, setNotifyReposts,
    notifyMentions, setNotifyMentions,
    soundEnabled, setSoundEnabled,
    hapticEnabled, setHapticEnabled,
  } = useAppStore();

  const handlePushToggle = async (enabled: boolean) => {
    if (!enabled) {
      setNotificationsEnabled(false);
      await clearPushToken();
      showToast('Push notifications muted', '');
      return;
    }

    const result = await registerForPush();
    setNotificationsEnabled(result.granted);
    showToast(result.granted ? 'Push notifications enabled' : 'Notifications permission denied', result.granted ? 'Done' : '');
  };

  const ToggleRow = ({ icon: Icon, iconColor, label, subtitle, value, onValueChange }: {
    icon: any; iconColor: string; label: string; subtitle?: string;
    value: boolean; onValueChange: (v: boolean) => void;
  }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 }}>
      <View
        style={[{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, { borderRadius: radius.md, backgroundColor: colors.surfaceHover }]}
      >
        <Icon color={iconColor} size={18} />
      </View>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: colors.text, fontSize: fontSizes.body }}>{label}</Text>
        {subtitle && <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={switchTrack}
        thumbColor={SWITCH_THUMB}
      />
    </View>
  );

  const divider = <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />;

  return (
    <ResponsiveScreen>
      <ScreenHeader title={ttx("Notification Preferences")} />

      <ScrollView style={{ paddingHorizontal: 16, paddingTop: 16 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={animation(FadeInDown.delay(50).duration(220))}>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 8, marginLeft: 4 }}>{ttx("General")}</Text>
          <View
            style={[{ paddingHorizontal: 16, marginBottom: 20 }, {
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }]}
          >
            <ToggleRow
              icon={Bell}
              iconColor={colors.accent}
              label={ttx("Push Notifications")}
              subtitle={ttx("Master toggle for all notifications")}
              value={notificationsEnabled}
              onValueChange={handlePushToggle}
            />
          </View>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(100).duration(220))} style={{ opacity: notificationsEnabled ? 1 : 0.4 }} pointerEvents={notificationsEnabled ? 'auto' : 'none'}>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 8, marginLeft: 4 }}>{ttx("Activity Types")}</Text>
          <View
            style={[{ paddingHorizontal: 16, marginBottom: 20 }, {
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }]}
          >
            <ToggleRow icon={HeartStraight} iconColor={colors.danger} label={ttx("Likes")} subtitle={ttx("When someone likes your echo")} value={notifyLikes} onValueChange={(v) => { setNotifyLikes(v); void syncNotificationPrefs(); }} />
            {divider}
            <ToggleRow icon={ChatCircle} iconColor={colors.accent} label={ttx("Comments")} subtitle={ttx("When someone comments on your echo")} value={notifyComments} onValueChange={(v) => { setNotifyComments(v); void syncNotificationPrefs(); }} />
            {divider}
            <ToggleRow icon={UserPlus} iconColor={colors.success} label={ttx("New Followers")} subtitle={ttx("When someone follows you")} value={notifyFollows} onValueChange={(v) => { setNotifyFollows(v); void syncNotificationPrefs(); }} />
            {divider}
            <ToggleRow icon={Envelope} iconColor={colors.accent} label={ttx("Direct Messages")} subtitle={ttx("When you receive a new message")} value={notifyDMs} onValueChange={(v) => { setNotifyDMs(v); void syncNotificationPrefs(); }} />
            {divider}
            <ToggleRow icon={ArrowsClockwise} iconColor={colors.accent} label={ttx("Re-echoes")} subtitle={ttx("When someone re-echoes your post")} value={notifyReposts} onValueChange={(v) => { setNotifyReposts(v); void syncNotificationPrefs(); }} />
            {divider}
            <ToggleRow icon={Quotes} iconColor={colors.accent} label={ttx("Mentions")} subtitle={ttx("When someone mentions you")} value={notifyMentions} onValueChange={(v) => { setNotifyMentions(v); void syncNotificationPrefs(); }} />
          </View>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(150).duration(220))}>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 8, marginLeft: 4 }}>{ttx("Feedback")}</Text>
          <View
            style={[{ paddingHorizontal: 16, marginBottom: 20 }, {
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }]}
          >
            <ToggleRow icon={SpeakerHigh} iconColor={colors.textSecondary} label={ttx("Sound Effects")} subtitle={ttx("Play sounds for notifications and actions")} value={soundEnabled} onValueChange={setSoundEnabled} />
            {divider}
            <ToggleRow icon={Bell} iconColor={colors.textSecondary} label={ttx("Haptic Feedback")} subtitle={ttx("Vibration feedback on interactions")} value={hapticEnabled} onValueChange={setHapticEnabled} />
          </View>
        </Animated.View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </ResponsiveScreen>
  );
}
