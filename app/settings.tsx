import React, { useState } from 'react';
import { View, Text, ScrollView, Switch, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import {
  ArrowLeft, CaretRight, Bell, Vibrate, Lock, Moon, SpeakerHigh,
  Shield, Info, Question, SignOut, Trash, Eye, EyeSlash,
  ChatTeardropDots, Lightning, Translate, WifiSlash, ShieldCheck,
  Palette, TextT, SquaresFour, Star, Robot, FloppyDisk,
  ChatCircle, Broadcast, Database, Eraser, BookmarkSimple,
  BellSlash, Rectangle,
  Check, DeviceMobile, Users, Envelope, SunHorizon,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme, THEMES, ThemeName } from '../lib/theme';
import { signOut } from '../lib/auth';

// ── Shared Components ──

function SettingsRow({ icon: Icon, iconColor, label, subtitle, right, onPress, destructive, theme }: {
  icon: any; label: string; iconColor?: string; subtitle?: string;
  right?: React.ReactNode; onPress?: () => void; destructive?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const { colors, radius, fontSizes } = theme;
  return (
    <AnimatedPressable onPress={onPress} className="flex-row items-center py-3.5 px-1" scaleValue={0.98} haptic="light">
      <View
        className="w-9 h-9 items-center justify-center mr-3"
        style={{
          borderRadius: radius.md,
          backgroundColor: destructive ? colors.dangerMuted : colors.surfaceHover,
        }}
      >
        <Icon color={destructive ? colors.danger : (iconColor || colors.textSecondary)} size={18} />
      </View>
      <View className="flex-1 mr-2">
        <Text style={{ color: destructive ? colors.danger : colors.text, fontSize: fontSizes.body }}>{label}</Text>
        {subtitle && <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {right || (onPress && <CaretRight color={colors.textMuted} size={18} />)}
    </AnimatedPressable>
  );
}

function OptionPicker<T extends string>({ title, options, value, onChange, onClose, theme }: {
  title: string; options: { label: string; value: T; desc?: string }[];
  value: T; onChange: (v: T) => void; onClose: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const { colors, radius, fontSizes, animation } = theme;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <AnimatedPressable
        onPress={onClose}
        scaleValue={1}
        haptic="none"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}
      >
        <Animated.View
          entering={animation(FadeIn.duration(200))}
          className="px-4 pb-10 pt-4"
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View className="w-10 h-1 rounded-full self-center mb-4" style={{ backgroundColor: colors.surfaceHover }} />
          <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '700', marginBottom: 16, marginLeft: 4 }}>{title}</Text>
          {options.map(opt => {
            const active = value === opt.value;
            return (
              <AnimatedPressable
                key={opt.value}
                onPress={() => { onChange(opt.value); onClose(); }}
                className="flex-row items-center py-3.5 px-4 mb-1.5"
                style={{
                  borderRadius: radius.md,
                  backgroundColor: active ? colors.accentMuted : colors.surfaceHover,
                  borderWidth: active ? 1 : 0,
                  borderColor: active ? colors.accent : 'transparent',
                }}
                scaleValue={0.97}
                haptic="light"
              >
                <View className="flex-1">
                  <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '500' }}>{opt.label}</Text>
                  {opt.desc && <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, marginTop: 2 }}>{opt.desc}</Text>}
                </View>
                {active && <Check color={colors.accent} size={20} />}
              </AnimatedPressable>
            );
          })}
        </Animated.View>
      </AnimatedPressable>
    </Modal>
  );
}

// ── Accent Color Picker ──

const ACCENT_COLORS = [
  { color: '#3B82F6', name: 'Blue' },
  { color: '#EF4444', name: 'Red' },
  { color: '#10B981', name: 'Green' },
  { color: '#F59E0B', name: 'Amber' },
  { color: '#8B5CF6', name: 'Purple' },
  { color: '#EC4899', name: 'Pink' },
  { color: '#06B6D4', name: 'Cyan' },
  { color: '#F97316', name: 'Orange' },
  { color: '#14B8A6', name: 'Teal' },
  { color: '#6366F1', name: 'Indigo' },
];

function AccentColorPicker({ value, onChange, onClose, theme }: {
  value: string; onChange: (v: string) => void; onClose: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const { colors, radius, fontSizes, animation } = theme;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <AnimatedPressable
        onPress={onClose}
        scaleValue={1}
        haptic="none"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}
      >
        <Animated.View
          entering={animation(FadeIn.duration(200))}
          className="px-4 pb-10 pt-4"
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View className="w-10 h-1 rounded-full self-center mb-4" style={{ backgroundColor: colors.surfaceHover }} />
          <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Accent Color</Text>
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginBottom: 16, marginLeft: 4 }}>Choose the accent color used throughout the app</Text>
          <View className="flex-row flex-wrap gap-3 justify-center">
            {ACCENT_COLORS.map(c => (
              <AnimatedPressable
                key={c.color}
                onPress={() => { onChange(c.color); onClose(); showToast(`Accent: ${c.name}`, '\u{1F3A8}'); }}
                scaleValue={0.85}
                haptic="medium"
                className="items-center"
              >
                <View
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: c.color,
                    borderWidth: value === c.color ? 2 : 0,
                    borderColor: colors.text,
                  }}
                >
                  {value === c.color && <Check color="#fff" size={20} />}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 6 }}>{c.name}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </Animated.View>
      </AnimatedPressable>
    </Modal>
  );
}

// ── Theme Picker ──

function ThemePicker({ value, onChange, onClose, theme }: {
  value: ThemeName; onChange: (v: ThemeName) => void; onClose: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const { colors, radius, fontSizes, animation } = theme;
  const themeOrder: ThemeName[] = ['midnight', 'amoled', 'ocean', 'sunset', 'forest', 'lavender'];

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <AnimatedPressable
        onPress={onClose}
        scaleValue={1}
        haptic="none"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}
      >
        <Animated.View
          entering={animation(FadeIn.duration(200))}
          className="px-4 pb-10 pt-4"
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View className="w-10 h-1 rounded-full self-center mb-4" style={{ backgroundColor: colors.surfaceHover }} />
          <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Choose Theme</Text>
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginBottom: 16, marginLeft: 4 }}>Pick a color palette that matches your vibe</Text>

          <View className="flex-row flex-wrap justify-between">
            {themeOrder.map(key => {
              const t = THEMES[key];
              const active = value === key;
              return (
                <AnimatedPressable
                  key={key}
                  onPress={() => { onChange(key); onClose(); showToast(`Theme: ${t.name}`, '\u{1F3A8}'); }}
                  scaleValue={0.95}
                  haptic="medium"
                  style={{
                    width: '48%',
                    marginBottom: 12,
                    borderRadius: radius.card,
                    overflow: 'hidden',
                    borderWidth: 2,
                    borderColor: active ? t.accent : 'transparent',
                  }}
                >
                  <View style={{ backgroundColor: t.bg, padding: 12 }}>
                    <View className="flex-row items-center mb-3">
                      <View style={{ backgroundColor: t.accent, width: 24, height: 24, borderRadius: 999, marginRight: 8 }} />
                      <Text style={{ color: t.text, fontWeight: '700', fontSize: fontSizes.body, flex: 1 }}>{t.name}</Text>
                      {active && <Check color={t.accent} size={18} />}
                    </View>

                    <View style={{ backgroundColor: t.surface, padding: 8, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: t.border }}>
                      <View style={{ backgroundColor: t.textSecondary, height: 4, borderRadius: 2, marginBottom: 4, width: '80%' }} />
                      <View style={{ backgroundColor: t.textMuted, height: 3, borderRadius: 2, width: '60%' }} />
                    </View>

                    <View className="flex-row gap-1.5">
                      <View style={{ backgroundColor: t.accent, height: 6, borderRadius: 3, flex: 2 }} />
                      <View style={{ backgroundColor: t.danger, height: 6, borderRadius: 3, flex: 1 }} />
                      <View style={{ backgroundColor: t.success, height: 6, borderRadius: 3, flex: 1 }} />
                    </View>
                  </View>
                </AnimatedPressable>
              );
            })}
          </View>
        </Animated.View>
      </AnimatedPressable>
    </Modal>
  );
}

// ── Main Screen ──

export default function SettingsScreen() {
  const router = useRouter();
  const s = useAppStore();
  const theme = useTheme();
  const { colors, radius, fontSizes, switchTrack, animation } = theme;

  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showBubblePicker, setShowBubblePicker] = useState(false);
  const [showDmPicker, setShowDmPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showFeedSortPicker, setShowFeedSortPicker] = useState(false);
  const [showCornerPicker, setShowCornerPicker] = useState(false);
  const [showAccentPicker, setShowAccentPicker] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await signOut();
          // onAuthStateChange in _layout.tsx handles redirect to /auth/login
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
        { text: 'Delete Forever', style: 'destructive', onPress: async () => {
          s.clearAllData();
          await signOut();
        }},
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert('Clear Cache', `Current cache: ${s.getCacheSize()}\n\nThis will clear cached data but keep your account and settings.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        s.clearChatHistory();
        s.clearNotifications();
        showToast('Cache cleared', '\u{1F9F9}');
      }},
    ]);
  };

  const handleClearChats = () => {
    Alert.alert('Clear Chat History', `Delete all ${s.sessions.length} chat sessions? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: () => {
        s.clearChatHistory();
        showToast('Chat history cleared', '\u{1F5D1}');
      }},
    ]);
  };

  const handleClearBookmarks = () => {
    Alert.alert('Clear Bookmarks', `Remove all ${s.bookmarkedIds.length} bookmarks?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: () => {
        s.clearAllBookmarks();
        showToast('Bookmarks cleared', '');
      }},
    ]);
  };

  const handleClearNotifications = () => {
    Alert.alert('Clear Notifications', 'Remove all notifications?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: () => {
        s.clearNotifications();
        showToast('Notifications cleared', '');
      }},
    ]);
  };

  const fontLabel = { small: 'Small', medium: 'Medium', large: 'Large' }[s.fontSize];
  const modelLabel = { 'gpt-3.5': 'GPT-3.5 Turbo', 'gpt-4': 'GPT-4', 'gpt-4o': 'GPT-4o' }[s.aiModel];
  const bubbleLabel = { modern: 'Modern', classic: 'Classic', minimal: 'Minimal' }[s.chatBubbleStyle];
  const dmLabel = { everyone: 'Everyone', followers: 'Followers Only', nobody: 'Nobody' }[s.dmPrivacy];
  const feedLabel = { latest: 'Latest', popular: 'Popular', following: 'Following' }[s.feedSort];
  const cornerLabel = { small: 'Small', medium: 'Medium', large: 'Large' }[s.roundedCorners];
  const themeLabel = THEMES[s.theme]?.name ?? 'Midnight';

  const sectionHeaderStyle = {
    color: colors.textMuted,
    fontSize: fontSizes.caption,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  };

  const cardStyle = {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  };

  const divider = <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />;

  const SwitchEl = (v: boolean, onChange: (val: boolean) => void) => (
    <Switch value={v} onValueChange={onChange} trackColor={switchTrack} thumbColor="#fff" />
  );

  const chevronValue = (label: string) => (
    <View className="flex-row items-center">
      <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginRight: 4 }}>{label}</Text>
      <CaretRight color={colors.textMuted} size={18} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} className="p-1 mr-3" scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-4 pt-4">

        {/* NOTIFICATIONS */}
        <Animated.View entering={animation(FadeInDown.delay(50).springify())}>
          <Text style={sectionHeaderStyle}>Notifications</Text>
          <View className="px-4 mb-5" style={cardStyle}>
            <SettingsRow theme={theme} icon={Bell} iconColor={colors.accent} label="Push Notifications" subtitle={s.notificationsEnabled ? 'On' : 'Off'} right={SwitchEl(s.notificationsEnabled, s.setNotificationsEnabled)} />
            {divider}
            <SettingsRow theme={theme} icon={Vibrate} label="Haptic Feedback" subtitle="Vibration on interactions" right={SwitchEl(s.hapticEnabled, s.setHapticEnabled)} />
            {divider}
            <SettingsRow theme={theme} icon={SpeakerHigh} label="Sound Effects" subtitle="Play sounds for actions" right={SwitchEl(s.soundEnabled, s.setSoundEnabled)} />
            {divider}
            <SettingsRow theme={theme} icon={Bell} label="Notification Preferences" subtitle="Customize which notifications you receive" onPress={() => router.push('/notification-prefs')} />
          </View>
        </Animated.View>

        {/* PRIVACY & SAFETY */}
        <Animated.View entering={animation(FadeInDown.delay(100).springify())}>
          <Text style={sectionHeaderStyle}>Privacy & Safety</Text>
          <View className="px-4 mb-5" style={cardStyle}>
            <SettingsRow theme={theme} icon={Lock} iconColor="#F59E0B" label="Private Account" subtitle="Only followers can see your echoes" right={SwitchEl(s.privateAccount, s.setPrivateAccount)} />
            {divider}
            <SettingsRow theme={theme} icon={Eye} label="Activity Status" subtitle="Show when you're online" right={SwitchEl(s.activityStatus, s.setActivityStatus)} />
            {divider}
            <SettingsRow theme={theme} icon={EyeSlash} label="Online Status" subtitle="Let others see your online indicator" right={SwitchEl(s.onlineStatus, s.setOnlineStatus)} />
            {divider}
            <SettingsRow theme={theme} icon={ChatCircle} label="Read Receipts" subtitle="Show when you've read messages" right={SwitchEl(s.readReceipts, s.setReadReceipts)} />
            {divider}
            <SettingsRow theme={theme} icon={Envelope} label="Who Can Message You" subtitle={dmLabel} onPress={() => setShowDmPicker(true)} right={chevronValue(dmLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={ShieldCheck} iconColor={colors.success} label="Sensitive Content Filter" subtitle="Filter potentially sensitive content" right={SwitchEl(s.sensitiveContentFilter, s.setSensitiveContentFilter)} />
            {divider}
            <SettingsRow theme={theme} icon={Users} label={`Blocked Users (${s.blockedIds.length})`} subtitle="Manage users you've blocked" onPress={() => router.push('/blocked-users')} />
          </View>
        </Animated.View>

        {/* APPEARANCE & DISPLAY */}
        <Animated.View entering={animation(FadeInDown.delay(150).springify())}>
          <Text style={sectionHeaderStyle}>Appearance & Display</Text>
          <View className="px-4 mb-5" style={cardStyle}>
            <SettingsRow
              theme={theme}
              icon={SunHorizon}
              iconColor={colors.accent}
              label="Theme"
              subtitle={`${themeLabel} — tap to change`}
              onPress={() => setShowThemePicker(true)}
              right={
                <View className="flex-row items-center">
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      marginRight: 8,
                      backgroundColor: THEMES[s.theme]?.bg ?? colors.bg,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View style={{ position: 'absolute', top: 3, left: 3, width: 16, height: 16, borderRadius: 999, backgroundColor: THEMES[s.theme]?.accent ?? colors.accent }} />
                  </View>
      <CaretRight color={colors.textMuted} size={18} />
            </View>
              }
            />
            {divider}
            <SettingsRow theme={theme} icon={Moon} iconColor="#8B5CF6" label="Dark Mode" subtitle="Always on for OLED savings" right={SwitchEl(s.darkMode, s.setDarkMode)} />
            {divider}
            <SettingsRow theme={theme} icon={DeviceMobile} label="Pure Black Background" subtitle="True black for AMOLED screens" right={SwitchEl(s.pureBlackBackground, s.setPureBlackBackground)} />
            {divider}
            <SettingsRow
              theme={theme}
              icon={Palette}
              iconColor={s.accentColor}
              label="Accent Color"
              subtitle="Customize the app's accent color"
              onPress={() => setShowAccentPicker(true)}
              right={
                <View className="flex-row items-center">
                  <View style={{ width: 20, height: 20, borderRadius: 999, marginRight: 8, backgroundColor: s.accentColor }} />
                  <CaretRight color={colors.textMuted} size={18} />
                </View>
              }
            />
            {divider}
            <SettingsRow theme={theme} icon={TextT} label="Font Size" subtitle={fontLabel} onPress={() => setShowFontPicker(true)} right={chevronValue(fontLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={Rectangle} label="Corner Radius" subtitle={`${cornerLabel} rounded corners`} onPress={() => setShowCornerPicker(true)} right={chevronValue(cornerLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={Eye} label="Show Avatars" subtitle="Display user avatar icons" right={SwitchEl(s.showAvatars, s.setShowAvatars)} />
            {divider}
            <SettingsRow theme={theme} icon={SquaresFour} label="Show Preview Cards" subtitle="Show response previews in feed" right={SwitchEl(s.showPreviewCards, s.setShowPreviewCards)} />
            {divider}
            <SettingsRow theme={theme} icon={Lightning} label="Reduce Animations" subtitle="Minimize motion effects" right={SwitchEl(s.reduceAnimations, s.setReduceAnimations)} />
          </View>
        </Animated.View>

        {/* CONTENT & FEED */}
        <Animated.View entering={animation(FadeInDown.delay(200).springify())}>
          <Text style={sectionHeaderStyle}>Content & Feed</Text>
          <View className="px-4 mb-5" style={cardStyle}>
            <SettingsRow theme={theme} icon={SquaresFour} label="Feed Sort" subtitle={`Show ${feedLabel.toLowerCase()} posts first`} onPress={() => setShowFeedSortPicker(true)} right={chevronValue(feedLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={SquaresFour} label="Compact Feed" subtitle="Show smaller cards in the feed" right={SwitchEl(s.compactFeed, s.setCompactFeed)} />
            {divider}
            <SettingsRow theme={theme} icon={Broadcast} label="Autoplay Stories" subtitle="Auto-advance through stories" right={SwitchEl(s.autoplayStories, s.setAutoplayStories)} />
            {divider}
            <SettingsRow theme={theme} icon={Translate} label="Content Language" subtitle={s.contentLanguage} onPress={() => setShowLanguagePicker(true)} right={chevronValue(s.contentLanguage)} />
            {divider}
            <SettingsRow theme={theme} icon={WifiSlash} label="Data Saver" subtitle="Reduce data usage on mobile" right={SwitchEl(s.dataSaver, s.setDataSaver)} />
          </View>
        </Animated.View>

        {/* CHAT & AI */}
        <Animated.View entering={animation(FadeInDown.delay(250).springify())}>
          <Text style={sectionHeaderStyle}>Chat & AI</Text>
          <View className="px-4 mb-5" style={cardStyle}>
            <SettingsRow theme={theme} icon={Robot} iconColor={colors.accent} label="AI Model" subtitle={modelLabel} onPress={() => setShowModelPicker(true)} right={chevronValue(modelLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={ChatTeardropDots} label="Chat Bubble Style" subtitle={bubbleLabel} onPress={() => setShowBubblePicker(true)} right={chevronValue(bubbleLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={Star} label="Stream Responses" subtitle="Show AI responses as they're generated" right={SwitchEl(s.streamResponses, s.setStreamResponses)} />
            {divider}
            <SettingsRow theme={theme} icon={Lightning} label="Typing Indicator" subtitle="Show dots while AI is thinking" right={SwitchEl(s.showTypingIndicator, s.setShowTypingIndicator)} />
            {divider}
            <SettingsRow theme={theme} icon={FloppyDisk} label="Auto-save Chats" subtitle="Automatically save conversations" right={SwitchEl(s.autoSaveChats, s.setAutoSaveChats)} />
          </View>
        </Animated.View>

        {/* STORAGE & DATA */}
        <Animated.View entering={animation(FadeInDown.delay(300).springify())}>
          <Text style={sectionHeaderStyle}>Storage & Data</Text>
          <View className="px-4 mb-5" style={cardStyle}>
            <SettingsRow theme={theme} icon={Database} label="Storage Used" right={<Text style={{ color: colors.textSecondary, fontSize: fontSizes.small }}>{s.getCacheSize()}</Text>} />
            {divider}
            <SettingsRow theme={theme} icon={Eraser} label="Clear Cache" subtitle="Free up storage space" onPress={handleClearCache} />
            {divider}
            <SettingsRow theme={theme} icon={ChatTeardropDots} label={`Clear Chat History (${s.sessions.length})`} subtitle="Delete all AI conversations" onPress={handleClearChats} />
            {divider}
            <SettingsRow theme={theme} icon={BookmarkSimple} label={`Clear Bookmarks (${s.bookmarkedIds.length})`} subtitle="Remove all saved echoes" onPress={handleClearBookmarks} />
            {divider}
            <SettingsRow theme={theme} icon={BellSlash} label="Clear Notifications" subtitle="Remove all notifications" onPress={handleClearNotifications} />
          </View>
        </Animated.View>

        {/* ABOUT */}
        <Animated.View entering={animation(FadeInDown.delay(350).springify())}>
          <Text style={sectionHeaderStyle}>About</Text>
          <View className="px-4 mb-5" style={cardStyle}>
            <SettingsRow theme={theme} icon={Shield} label="Privacy Policy" onPress={() => Alert.alert('Privacy Policy', 'Echo respects your privacy. We collect minimal data to provide the best experience. Your chats are processed via encrypted connections and are never stored on our servers permanently.')} />
            {divider}
            <SettingsRow theme={theme} icon={Question} label="Help & Support" onPress={() => Alert.alert('Help & Support', 'For help, contact echo-support@example.com\n\nFAQ:\n\u2022 Swipe on feed cards for actions\n\u2022 Long-press messages to copy\n\u2022 Tap avatars to view profiles\n\u2022 Pull down to refresh feeds')} />
            {divider}
            <SettingsRow theme={theme} icon={Info} label="Version" right={<Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>1.2.0 (42)</Text>} />
            {divider}
            <SettingsRow theme={theme} icon={Star} label="What's New" onPress={() => Alert.alert("What's New in 1.2.0", '\u2022 Multi-theme system (6 themes)\n\u2022 Every setting is now live\n\u2022 Online status indicators\n\u2022 Accent color customization\n\u2022 Font size + corner radius controls\n\u2022 Reduce animations respected everywhere')} />
          </View>
        </Animated.View>

        {/* DANGER ZONE */}
        <Animated.View entering={animation(FadeInDown.delay(400).springify())}>
          <Text style={sectionHeaderStyle}>Danger Zone</Text>
          <View className="px-4 mb-5" style={cardStyle}>
            <SettingsRow theme={theme} icon={SignOut} label="Sign Out" onPress={handleSignOut} destructive />
            {divider}
            <SettingsRow theme={theme} icon={Trash} label="Delete Account" subtitle="Permanently delete all data" onPress={handleDeleteAccount} destructive />
          </View>
        </Animated.View>

        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'center', marginBottom: 8 }}>Echo v1.2.0</Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'center', marginBottom: 32, opacity: 0.6 }}>Made with love</Text>
      </ScrollView>

      {/* PICKERS */}
      {showThemePicker && (
        <ThemePicker value={s.theme} onChange={s.setTheme} onClose={() => setShowThemePicker(false)} theme={theme} />
      )}

      {showFontPicker && (
        <OptionPicker
          theme={theme}
          title="Font Size"
          options={[
            { label: 'Small', value: 'small' as const, desc: 'Fit more content on screen' },
            { label: 'Medium', value: 'medium' as const, desc: 'Default size (recommended)' },
            { label: 'Large', value: 'large' as const, desc: 'Easier to read' },
          ]}
          value={s.fontSize}
          onChange={(v) => { s.setFontSize(v); showToast(`Font size: ${v}`, '\u{1F524}'); }}
          onClose={() => setShowFontPicker(false)}
        />
      )}

      {showModelPicker && (
        <OptionPicker
          theme={theme}
          title="AI Model"
          options={[
            { label: 'GPT-3.5 Turbo', value: 'gpt-3.5' as const, desc: 'Fast and efficient' },
            { label: 'GPT-4', value: 'gpt-4' as const, desc: 'Most capable, slower' },
            { label: 'GPT-4o', value: 'gpt-4o' as const, desc: 'Fast + capable (recommended)' },
          ]}
          value={s.aiModel}
          onChange={(v) => { s.setAiModel(v); showToast(`Model: ${v}`, '\u{1F916}'); }}
          onClose={() => setShowModelPicker(false)}
        />
      )}

      {showBubblePicker && (
        <OptionPicker
          theme={theme}
          title="Chat Bubble Style"
          options={[
            { label: 'Modern', value: 'modern' as const, desc: 'Rounded with accent colors' },
            { label: 'Classic', value: 'classic' as const, desc: 'Traditional message style' },
            { label: 'Minimal', value: 'minimal' as const, desc: 'Clean, no background' },
          ]}
          value={s.chatBubbleStyle}
          onChange={(v) => { s.setChatBubbleStyle(v); showToast(`Bubble style: ${v}`, '\u{1F4AC}'); }}
          onClose={() => setShowBubblePicker(false)}
        />
      )}

      {showDmPicker && (
        <OptionPicker
          theme={theme}
          title="Who Can Message You"
          options={[
            { label: 'Everyone', value: 'everyone' as const, desc: 'Any user can send you a message' },
            { label: 'Followers Only', value: 'followers' as const, desc: 'Only people who follow you' },
            { label: 'Nobody', value: 'nobody' as const, desc: 'Disable direct messages' },
          ]}
          value={s.dmPrivacy}
          onChange={(v) => { s.setDmPrivacy(v); showToast(`DMs: ${v}`, '\u{1F4EC}'); }}
          onClose={() => setShowDmPicker(false)}
        />
      )}

      {showLanguagePicker && (
        <OptionPicker
          theme={theme}
          title="Content Language"
          options={[
            { label: 'English', value: 'English' as string },
            { label: 'Spanish', value: 'Spanish' as string },
            { label: 'French', value: 'French' as string },
            { label: 'German', value: 'German' as string },
            { label: 'Japanese', value: 'Japanese' as string },
            { label: 'Korean', value: 'Korean' as string },
            { label: 'Chinese', value: 'Chinese' as string },
            { label: 'Hindi', value: 'Hindi' as string },
            { label: 'Portuguese', value: 'Portuguese' as string },
            { label: 'Arabic', value: 'Arabic' as string },
          ]}
          value={s.contentLanguage}
          onChange={(v) => { s.setContentLanguage(v); showToast(`Language: ${v}`, '\u{1F30D}'); }}
          onClose={() => setShowLanguagePicker(false)}
        />
      )}

      {showFeedSortPicker && (
        <OptionPicker
          theme={theme}
          title="Feed Sort Order"
          options={[
            { label: 'Latest', value: 'latest' as const, desc: 'Most recent posts first' },
            { label: 'Popular', value: 'popular' as const, desc: 'Sort by engagement' },
            { label: 'Following', value: 'following' as const, desc: 'Only from people you follow' },
          ]}
          value={s.feedSort}
          onChange={(v) => { s.setFeedSort(v); showToast(`Feed: ${v}`, '\u{1F4F0}'); }}
          onClose={() => setShowFeedSortPicker(false)}
        />
      )}

      {showCornerPicker && (
        <OptionPicker
          theme={theme}
          title="Corner Radius"
          options={[
            { label: 'Small', value: 'small' as const, desc: 'Subtle rounded corners (8px)' },
            { label: 'Medium', value: 'medium' as const, desc: 'Default rounded corners (16px)' },
            { label: 'Large', value: 'large' as const, desc: 'Extra rounded corners (24px)' },
          ]}
          value={s.roundedCorners}
          onChange={(v) => { s.setRoundedCorners(v); showToast(`Corners: ${v}`, '\u{25FE}'); }}
          onClose={() => setShowCornerPicker(false)}
        />
      )}

      {showAccentPicker && (
        <AccentColorPicker
          theme={theme}
          value={s.accentColor}
          onChange={s.setAccentColor}
          onClose={() => setShowAccentPicker(false)}
        />
      )}
    </SafeAreaView>
  );
}
