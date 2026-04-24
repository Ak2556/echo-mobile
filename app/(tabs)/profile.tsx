import React from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Gear, BookmarkSimple, ChatTeardropDots, CaretRight, Bell, Vibration, Info, SignOut, Shield,
  PencilSimple, Users, Envelope, Lightning,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { signOut } from '../../lib/auth';

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<any> }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable scaleValue={0.95} haptic="light" style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
      <Icon color={colors.accent} size={20} />
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 6 }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </AnimatedPressable>
  );
}

function SettingsRow({ icon: Icon, label, right, onPress }: {
  icon: React.ComponentType<any>; label: string; right?: React.ReactNode; onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 }}
      scaleValue={0.98}
      haptic="light"
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: colors.surfaceHover }}>
        <Icon color={colors.textSecondary} size={18} />
      </View>
      <Text style={{ color: colors.text, fontSize: 16, flex: 1 }}>{label}</Text>
      {right || <CaretRight color={colors.textMuted} size={18} />}
    </AnimatedPressable>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 16,
      }}
    >
      {children}
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, radius, switchTrack, animation } = useTheme();
  const {
    userId,
    username, sessions, bookmarkedIds, publishedEchoes,
    hapticEnabled, setHapticEnabled, notificationsEnabled, setNotificationsEnabled,
  } = useAppStore();

  const handleSignOut = async () => {
    await signOut();
  };

  const savedCount = bookmarkedIds.length;

  // Derive a gradient pair from the accent color
  const accentHex = colors.accent;
  const gradientColors = [accentHex, colors.bg] as [string, string];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Hero header */}
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ height: 160 }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
        </LinearGradient>

        {/* Floating glass card — overlaps header */}
        <Animated.View
          entering={animation(FadeInDown.delay(100).springify())}
          style={{ marginTop: -56, marginHorizontal: 16 }}
        >
          <GlassPanel borderRadius={radius.card} intensity={65}>
            <View style={{ alignItems: 'center', paddingTop: 20, paddingBottom: 16, paddingHorizontal: 16 }}>
              <AnimatedPressable scaleValue={0.93} haptic="light">
                <View
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                    borderWidth: 3,
                    borderColor: 'rgba(255,255,255,0.2)',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>
                    {(username || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              </AnimatedPressable>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>@{username || 'user'}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 3 }}>Echo member</Text>

              {/* Stat row */}
              <View style={{ flexDirection: 'row', width: '100%', marginTop: 16, borderTopWidth: 1, borderTopColor: colors.glassBorder ?? 'rgba(255,255,255,0.1)' }}>
                <StatCard label="Chats" value={sessions.length} icon={ChatTeardropDots} />
                <View style={{ width: 1, backgroundColor: colors.glassBorder ?? 'rgba(255,255,255,0.1)', marginVertical: 8 }} />
                <StatCard label="Echoes" value={publishedEchoes.length} icon={Lightning} />
                <View style={{ width: 1, backgroundColor: colors.glassBorder ?? 'rgba(255,255,255,0.1)', marginVertical: 8 }} />
                <StatCard label="Saved" value={savedCount} icon={BookmarkSimple} />
              </View>
            </View>
          </GlassPanel>
        </Animated.View>

        {/* Account section */}
        <Animated.View entering={animation(FadeInDown.delay(200).springify())} style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>Account</Text>
          <SectionCard>
            <SettingsRow icon={PencilSimple} label="Edit profile" onPress={() => router.push('/edit-profile')} />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow icon={BookmarkSimple} label="Bookmarks" onPress={() => router.push('/bookmarks')} />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow icon={Envelope} label="Messages" onPress={() => router.push('/messages')} />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow icon={Users} label="Connections" onPress={() => router.push({ pathname: '/followers', params: { userId, tab: 'followers' } })} />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow icon={Gear} label="Settings" onPress={() => router.push('/settings')} />
          </SectionCard>
        </Animated.View>

        {/* Preferences section */}
        <Animated.View entering={animation(FadeInDown.delay(270).springify())} style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>Preferences</Text>
          <SectionCard>
            <SettingsRow
              icon={Vibration}
              label="Haptic Feedback"
              right={
                <Switch value={hapticEnabled} onValueChange={setHapticEnabled} trackColor={switchTrack} thumbColor="#fff" />
              }
            />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow
              icon={Bell}
              label="Notifications"
              right={
                <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={switchTrack} thumbColor="#fff" />
              }
            />
          </SectionCard>
        </Animated.View>

        {/* About section */}
        <Animated.View entering={animation(FadeInDown.delay(330).springify())} style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>About</Text>
          <SectionCard>
            <SettingsRow icon={Shield} label="Privacy Policy" />
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <SettingsRow
              icon={Info}
              label="Version"
              right={<Text style={{ color: colors.textMuted, fontSize: 14 }}>1.0.0</Text>}
            />
          </SectionCard>
        </Animated.View>

        {/* Sign out */}
        <Animated.View entering={animation(FadeInDown.delay(390).springify())} style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <AnimatedPressable
            onPress={() => { void handleSignOut(); }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: colors.surface,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            scaleValue={0.97}
            haptic="medium"
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: colors.dangerMuted }}>
              <SignOut color={colors.danger} size={18} />
            </View>
            <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '500' }}>Sign Out</Text>
          </AnimatedPressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
