import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, Alert, Modal, Platform, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import {
  ArrowLeft, CaretRight, Bell, Vibrate, Lock, Moon, SpeakerHigh,
  Shield, Info, Question, SignOut, Trash, Eye, EyeSlash,
  ChatTeardropDots, Lightning, Translate, WifiSlash, ShieldCheck,
  Palette, TextT, SquaresFour, Star, Robot, FloppyDisk,
  ChatCircle, Broadcast, Database, Eraser, BookmarkSimple,
  BellSlash, Rectangle, FileText,
  Check, DeviceMobile, Users, Envelope, SunHorizon, UserCircle, Brain,
  Warning, ListChecks, Globe, Gavel,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { GlassPanel } from '../components/ui/GlassPanel';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme, THEMES, ThemeName } from '../lib/theme';
import { signOut } from '../lib/auth';
import { deleteRemoteAIConversations, updateRemoteProfile, fetchCurrentUserProfile } from '../lib/supabaseEchoApi';
import { clearPushToken, registerForPush } from '../lib/push';
import { useResponsiveLayout } from '../lib/responsive';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { setPersonaEnabled } from '../lib/persona';
import { track } from '../lib/analytics';
import { isSafeExternalUrl } from '../lib/urlSafety';

function openTrustedExternalUrl(url: string): void {
  if (!isSafeExternalUrl(url)) return;
  void Linking.openURL(url);
}

function SettingsRow({ icon: Icon, iconColor, label, subtitle, right, onPress, destructive, theme }: {
  icon: any; label: string; iconColor?: string; subtitle?: string;
  right?: React.ReactNode; onPress?: () => void; destructive?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const { colors, radius, fontSizes } = theme;
  return (
    <AnimatedPressable
      onPress={onPress}
      scaleValue={0.98}
      haptic="light"
      style={{
        minHeight: 62,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 11,
        paddingHorizontal: 4,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.md,
          backgroundColor: destructive ? colors.dangerMuted : colors.surfaceHover,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Icon color={destructive ? colors.danger : (iconColor || colors.textSecondary)} size={18} />
      </View>
      <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
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
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
      </View>
      <AnimatedPressable
        onPress={onClose}
        scaleValue={1}
        haptic="none"
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Animated.View
          entering={animation(FadeIn.duration(80))}
          style={{
            overflow: 'hidden',
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
          }}
        >
          {Platform.OS === 'ios' ? (
            <>
              <BlurView intensity={80} tint={colors.isDark ? 'dark' : 'extraLight'} style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassHeavyFill ?? 'rgba(255,255,255,0.1)' }]} />
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
          )}
          <View style={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.glassBorder, marginBottom: 16 }} />
            <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '700', marginBottom: 16, marginLeft: 4 }}>{title}</Text>
            {options.map(opt => {
              const active = value === opt.value;
              return (
                <AnimatedPressable
                  key={opt.value}
                  onPress={() => { onChange(opt.value); onClose(); }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    marginBottom: 6,
                    borderRadius: radius.md,
                    backgroundColor: active ? colors.accentMuted : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                    borderWidth: active ? 1 : StyleSheet.hairlineWidth,
                    borderColor: active ? colors.accent : colors.glassBorder,
                  }}
                  scaleValue={0.97}
                  haptic="light"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '500' }}>{opt.label}</Text>
                    {opt.desc && <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, marginTop: 2 }}>{opt.desc}</Text>}
                  </View>
                  {active && <Check color={colors.accent} size={20} />}
                </AnimatedPressable>
              );
            })}
          </View>
        </Animated.View>
      </AnimatedPressable>
    </Modal>
  );
}

// Accent Color Picker
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
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
      </View>
      <AnimatedPressable
        onPress={onClose}
        scaleValue={1}
        haptic="none"
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Animated.View
          entering={animation(FadeIn.duration(80))}
          style={{
            overflow: 'hidden',
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
          }}
        >
          {Platform.OS === 'ios' ? (
            <>
              <BlurView intensity={80} tint={colors.isDark ? 'dark' : 'extraLight'} style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassHeavyFill ?? 'rgba(255,255,255,0.1)' }]} />
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
          )}
          <View style={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.glassBorder, marginBottom: 16 }} />
          <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Accent Color</Text>
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginBottom: 16, marginLeft: 4 }}>Choose the accent color used throughout the app</Text>
          <View className="flex-row flex-wrap gap-3 justify-center">
            {ACCENT_COLORS.map(c => (
              <AnimatedPressable
                key={c.color}
                onPress={() => { onChange(c.color); onClose(); showToast(`Accent: ${c.name}`, 'Accent'); }}
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
          </View>
        </Animated.View>
      </AnimatedPressable>
    </Modal>
  );
}

// Theme Picker
function ThemePicker({ value, onChange, onClose, theme }: {
  value: ThemeName; onChange: (v: ThemeName) => void; onClose: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const { colors, radius, fontSizes, animation } = theme;
  const themeOrder: ThemeName[] = ['midnight', 'amoled', 'ocean', 'sunset', 'forest', 'lavender', 'light', 'sepia', 'arctic'];

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
      </View>
      <AnimatedPressable
        onPress={onClose}
        scaleValue={1}
        haptic="none"
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Animated.View
          entering={animation(FadeIn.duration(80))}
          style={{
            overflow: 'hidden',
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
          }}
        >
          {Platform.OS === 'ios' ? (
            <>
              <BlurView intensity={80} tint={colors.isDark ? 'dark' : 'extraLight'} style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassHeavyFill ?? 'rgba(255,255,255,0.1)' }]} />
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
          )}
          <View style={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.glassBorder, marginBottom: 16 }} />
            <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Choose Theme</Text>
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginBottom: 16, marginLeft: 4 }}>Pick a color palette that matches your taste</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {themeOrder.map(key => {
                const t = THEMES[key];
                const active = value === key;
                return (
                  <AnimatedPressable
                    key={key}
                    onPress={() => { onChange(key); onClose(); showToast(`Theme: ${t.name}`, 'Theme'); }}
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <View style={{ backgroundColor: t.accent, width: 24, height: 24, borderRadius: 999, marginRight: 8 }} />
                        <Text style={{ color: t.text, fontWeight: '700', fontSize: fontSizes.body, flex: 1 }}>{t.name}</Text>
                        {active && <Check color={t.accent} size={18} />}
                      </View>

                      <View style={{ backgroundColor: t.surface, padding: 8, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: t.border }}>
                        <View style={{ backgroundColor: t.textSecondary, height: 4, borderRadius: 2, marginBottom: 4, width: '80%' }} />
                        <View style={{ backgroundColor: t.textMuted, height: 3, borderRadius: 2, width: '60%' }} />
                      </View>

                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <View style={{ backgroundColor: t.accent, height: 6, borderRadius: 3, flex: 2 }} />
                        <View style={{ backgroundColor: t.danger, height: 6, borderRadius: 3, flex: 1 }} />
                        <View style={{ backgroundColor: t.success, height: 6, borderRadius: 3, flex: 1 }} />
                      </View>
                    </View>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </AnimatedPressable>
    </Modal>
  );
}

// Main Screen
export default function SettingsScreen() {
  const router = useRouter();
  const s = useAppStore();
  const theme = useTheme();
  const { colors, radius, fontSizes, switchTrack, animation } = theme;
  const layout = useResponsiveLayout();

  const [isModerator, setIsModerator] = useState(false);

  useEffect(() => {
    if (!isSupabaseRemote()) return;
    fetchCurrentUserProfile().then(p => {
      if (p?.is_moderator) setIsModerator(true);
    }).catch(() => {});
  }, []);

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
    // Route to the dedicated delete-account screen — Apple wants a
    // multi-step confirmation flow, not a one-tap alert.
    router.push('/delete-account');
  };

  const handleClearCache = () => {
    Alert.alert('Clear Cache', `Current cache: ${s.getCacheSize()}\n\nThis will clear cached data but keep your account and settings.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        s.clearChatHistory();
        s.clearNotifications();
        showToast('Cache cleared', 'Cleared');
      }},
    ]);
  };

  const handleClearChats = () => {
    Alert.alert('Clear Chat History', `Delete all ${s.sessions.length} chat sessions and server-side AI conversations? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: async () => {
        try {
          await deleteRemoteAIConversations();
          s.clearChatHistory();
          showToast('Chat history cleared', 'Done');
        } catch (e) {
          Alert.alert('Could not clear chat history', (e as Error).message);
        }
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

  const handlePushToggle = async (enabled: boolean) => {
    if (!enabled) {
      s.setNotificationsEnabled(false);
      showToast('Push notifications muted', '');
      void clearPushToken();
      return;
    }

    s.setNotificationsEnabled(true);
    const result = await registerForPush();
    if (!result.granted) {
      s.setNotificationsEnabled(false);
      showToast('Notifications permission denied', '');
    } else {
      showToast('Push notifications enabled', 'Done');
    }
  };

  const handleProfilePhotoVisibleToggle = async (visible: boolean) => {
    const previous = s.profilePhotoVisible;
    s.setProfilePhotoVisible(visible);

    if (!isSupabaseRemote()) {
      showToast(visible ? 'Profile photo visible' : 'Profile photo hidden', 'Profile');
      return;
    }

    try {
      await updateRemoteProfile({ avatar_url: visible ? (s.avatarUrl || null) : null });
      showToast(visible ? 'Profile photo visible' : 'Profile photo hidden', 'Profile');
    } catch (e) {
      s.setProfilePhotoVisible(previous);
      Alert.alert('Could not update profile photo visibility', (e as Error).message);
    }
  };

  const handlePrivateAccount = async (enabled: boolean) => {
    const prev = s.privateAccount;
    s.setPrivateAccount(enabled);
    if (!isSupabaseRemote()) return;
    try {
      await updateRemoteProfile({ is_private: enabled });
    } catch (e) {
      s.setPrivateAccount(prev);
      Alert.alert('Could not update private account', (e as Error).message);
    }
  };

  const handleActivityStatus = async (enabled: boolean) => {
    const prev = s.activityStatus;
    s.setActivityStatus(enabled);
    if (!isSupabaseRemote()) return;
    try {
      await updateRemoteProfile({ activity_status: enabled });
    } catch (e) {
      s.setActivityStatus(prev);
      Alert.alert('Could not update activity status', (e as Error).message);
    }
  };

  const handleOnlineStatus = async (enabled: boolean) => {
    const prev = s.onlineStatus;
    s.setOnlineStatus(enabled);
    if (!isSupabaseRemote()) return;
    try {
      await updateRemoteProfile({ online_status: enabled });
    } catch (e) {
      s.setOnlineStatus(prev);
      Alert.alert('Could not update online status', (e as Error).message);
    }
  };

  const handleReadReceipts = async (enabled: boolean) => {
    const prev = s.readReceipts;
    s.setReadReceipts(enabled);
    if (!isSupabaseRemote()) return;
    try {
      await updateRemoteProfile({ read_receipts: enabled });
    } catch (e) {
      s.setReadReceipts(prev);
      Alert.alert('Could not update read receipts', (e as Error).message);
    }
  };

  const handleDmPrivacy = async (v: 'everyone' | 'followers' | 'nobody') => {
    const prev = s.dmPrivacy;
    s.setDmPrivacy(v);
    if (!isSupabaseRemote()) { showToast(`DMs: ${v}`, 'DMs'); return; }
    try {
      await updateRemoteProfile({ dm_privacy: v });
      showToast(`DMs: ${v}`, 'DMs');
    } catch (e) {
      s.setDmPrivacy(prev);
      Alert.alert('Could not update DM privacy', (e as Error).message);
    }
  };

  const handlePersonaLearningToggle = (enabled: boolean) => {
    s.setPersonaLearningEnabled(enabled);
    setPersonaEnabled(enabled, s.userId);
    track(enabled ? 'persona_learning_started' : 'persona_learning_disabled');
  };

  const handleAiModel = async (v: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.0-flash-lite') => {
    const prev = s.aiModel;
    s.setAiModel(v);
    if (!isSupabaseRemote()) { showToast(`Model: ${v}`, 'Model'); return; }
    try { await updateRemoteProfile({ ai_model: v }); showToast(`Model: ${v}`, 'Model'); }
    catch (e) { s.setAiModel(prev); Alert.alert('Could not update AI model', (e as Error).message); }
  };

  const handleSensitiveContentFilter = async (enabled: boolean) => {
    const prev = s.sensitiveContentFilter;
    s.setSensitiveContentFilter(enabled);
    if (!isSupabaseRemote()) return;
    try { await updateRemoteProfile({ sensitive_content_filter: enabled }); }
    catch (e) { s.setSensitiveContentFilter(prev); Alert.alert('Could not update sensitive content filter', (e as Error).message); }
  };

  const handleContentLanguage = async (v: string) => {
    const prev = s.contentLanguage;
    s.setContentLanguage(v);
    if (!isSupabaseRemote()) { showToast(`Language: ${v}`, 'Language'); return; }
    try { await updateRemoteProfile({ content_language: v }); showToast(`Language: ${v}`, 'Language'); }
    catch (e) { s.setContentLanguage(prev); Alert.alert('Could not update content language', (e as Error).message); }
  };

  const handleStreamResponses = async (enabled: boolean) => {
    const prev = s.streamResponses;
    s.setStreamResponses(enabled);
    if (!isSupabaseRemote()) return;
    try { await updateRemoteProfile({ stream_responses: enabled }); }
    catch (e) { s.setStreamResponses(prev); Alert.alert('Could not update stream responses', (e as Error).message); }
  };

  const handleAutoSaveChats = async (enabled: boolean) => {
    const prev = s.autoSaveChats;
    s.setAutoSaveChats(enabled);
    if (!isSupabaseRemote()) return;
    try { await updateRemoteProfile({ auto_save_chats: enabled }); }
    catch (e) { s.setAutoSaveChats(prev); Alert.alert('Could not update auto-save chats', (e as Error).message); }
  };

  const fontLabel = { small: 'Small', medium: 'Medium', large: 'Large' }[s.fontSize];
  const modelLabel = {
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.0-flash-lite': 'Gemini 2.0 Flash Lite',
  }[s.aiModel];
  const bubbleLabel = { modern: 'Modern', classic: 'Classic', minimal: 'Minimal' }[s.chatBubbleStyle];
  const dmLabel = { everyone: 'Everyone', followers: 'Followers Only', nobody: 'Nobody' }[s.dmPrivacy];
  const feedLabel = { latest: 'Latest', popular: 'Popular', following: 'Following' }[s.feedSort];
  const cornerLabel = { small: 'Small', medium: 'Medium', large: 'Large' }[s.roundedCorners];
  const themeLabel = THEMES[s.theme]?.name ?? 'Midnight';

  const sectionHeaderStyle = {
    color: colors.textMuted,
    fontSize: fontSizes.caption,
    fontWeight: '600' as const,
    marginBottom: 8,
    marginLeft: 4,
  };

  const divider = <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }} />;

  const SwitchEl = (v: boolean, onChange: (val: boolean) => void) => (
    <Switch value={v} onValueChange={onChange} trackColor={switchTrack} thumbColor="#fff" />
  );

  const chevronValue = (label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginRight: 4 }}>{label}</Text>
      <CaretRight color={colors.textMuted} size={18} />
    </View>
  );

  const sectionGridStyle = layout.isDesktop
    ? { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 20 }
    : undefined;
  const sectionStyle = layout.isDesktop
    ? { width: '48.8%' as const, minWidth: 420, flexGrow: 1 }
    : undefined;
  const scrollContentStyle = {
    width: '100%' as const,
    maxWidth: layout.isDesktop ? 1180 : layout.contentMaxWidth,
    alignSelf: 'center' as const,
    paddingHorizontal: layout.gutter,
    paddingTop: layout.isDesktop ? 22 : 16,
    paddingBottom: layout.bottomChromePadding,
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: layout.isMacDesktop ? 84 : 16,
            paddingRight: 16,
            paddingVertical: layout.isDesktop ? 14 : 12,
          }}
        >
          <AnimatedPressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }} scaleValue={0.88} haptic="light">
            <ArrowLeft color={colors.text} size={24} />
          </AnimatedPressable>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>Settings</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={scrollContentStyle}>
        <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ padding: 16 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body, marginBottom: 8 }}>Account controls</Text>
          <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
            Review privacy, notifications, and accessibility before changing advanced preferences.
          </Text>
        </GlassPanel>

        <View style={sectionGridStyle}>
        {/* NOTIFICATIONS */}
        <Animated.View entering={animation(FadeInDown.delay(50).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>Essentials</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Bell} iconColor={colors.accent} label="Push Notifications" subtitle={s.notificationsEnabled ? 'On' : 'Off'} right={SwitchEl(s.notificationsEnabled, handlePushToggle)} />
            {divider}
            <SettingsRow theme={theme} icon={Vibrate} label="Haptic Feedback" subtitle="Vibration on interactions" right={SwitchEl(s.hapticEnabled, s.setHapticEnabled)} />
            {divider}
            <SettingsRow theme={theme} icon={SpeakerHigh} label="Sound Effects" subtitle="Play sounds for actions" right={SwitchEl(s.soundEnabled, s.setSoundEnabled)} />
            {divider}
            <SettingsRow theme={theme} icon={Bell} label="Notification Preferences" subtitle="Customize which notifications you receive" onPress={() => router.push('/notification-prefs')} />
            {divider}
            <SettingsRow theme={theme} icon={Lock} iconColor="#F59E0B" label="Private Account" subtitle="Safer default while you're learning the app" right={SwitchEl(s.privateAccount, handlePrivateAccount)} />
            {divider}
            <SettingsRow theme={theme} icon={ShieldCheck} iconColor={colors.success} label="Sensitive Content Filter" subtitle="Filter potentially sensitive content" right={SwitchEl(s.sensitiveContentFilter, handleSensitiveContentFilter)} />
          </GlassPanel>
        </Animated.View>

        {/* PRIVACY & SAFETY */}
        <Animated.View entering={animation(FadeInDown.delay(100).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>Privacy & Safety</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Eye} label="Activity Status" subtitle="Show when you're online" right={SwitchEl(s.activityStatus, handleActivityStatus)} />
            {divider}
            <SettingsRow theme={theme} icon={EyeSlash} label="Online Status" subtitle="Let others see your online indicator" right={SwitchEl(s.onlineStatus, handleOnlineStatus)} />
            {divider}
            <SettingsRow
              theme={theme}
              icon={UserCircle}
              iconColor={colors.accent}
              label="Profile Photo"
              subtitle={s.profilePhotoVisible ? 'Visible on profile and feed' : 'Hidden from other users'}
              right={SwitchEl(s.profilePhotoVisible, handleProfilePhotoVisibleToggle)}
            />
            {divider}
            <SettingsRow theme={theme} icon={ChatCircle} label="Read Receipts" subtitle="Show when you've read messages" right={SwitchEl(s.readReceipts, handleReadReceipts)} />
            {divider}
            <SettingsRow theme={theme} icon={Envelope} label="Who Can Message You" subtitle={dmLabel} onPress={() => setShowDmPicker(true)} right={chevronValue(dmLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={Users} label={`Blocked Users (${s.blockedIds.length})`} subtitle="Manage users you've blocked" onPress={() => router.push('/blocked-users')} />
            {divider}
            <SettingsRow theme={theme} icon={Users} label={`Muted Users (${s.mutedIds.length})`} subtitle="Hide their echoes without notifying them" onPress={() => router.push('/muted-users')} />
          </GlassPanel>
        </Animated.View>

        {/* APPEARANCE & DISPLAY */}
        <Animated.View entering={animation(FadeInDown.delay(150).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>Accessibility & Display</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow
              theme={theme}
              icon={SunHorizon}
              iconColor={colors.accent}
              label="Theme"
              subtitle={`${themeLabel} — tap to change`}
              onPress={() => setShowThemePicker(true)}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
          </GlassPanel>
        </Animated.View>

        {/* CONTENT & FEED */}
        <Animated.View entering={animation(FadeInDown.delay(200).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>Content & Feed</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={SquaresFour} label="Feed Sort" subtitle={`Show ${feedLabel.toLowerCase()} posts first`} onPress={() => setShowFeedSortPicker(true)} right={chevronValue(feedLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={SquaresFour} label="Compact Feed" subtitle="Show smaller cards in the feed" right={SwitchEl(s.compactFeed, s.setCompactFeed)} />
            {divider}
            <SettingsRow theme={theme} icon={Broadcast} label="Autoplay Stories" subtitle="Auto-advance through stories" right={SwitchEl(s.autoplayStories, s.setAutoplayStories)} />
            {divider}
            <SettingsRow theme={theme} icon={Translate} label="Content Language" subtitle={s.contentLanguage} onPress={() => setShowLanguagePicker(true)} right={chevronValue(s.contentLanguage)} />
            {divider}
            <SettingsRow theme={theme} icon={WifiSlash} label="Data Saver" subtitle="Reduce data usage on mobile" right={SwitchEl(s.dataSaver, s.setDataSaver)} />
          </GlassPanel>
        </Animated.View>

        {/* CHAT & AI */}
        <Animated.View entering={animation(FadeInDown.delay(250).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>Chat & AI</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Robot} iconColor={colors.accent} label="AI Model" subtitle={modelLabel} onPress={() => setShowModelPicker(true)} right={chevronValue(modelLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={Database} iconColor={colors.accent} label="AI Memory" subtitle="View and clear remembered preferences" onPress={() => router.push('/ai-memory')} />
            {divider}
            <SettingsRow
              theme={theme}
              icon={Brain}
              iconColor={colors.accent}
              label="Personal Persona"
              subtitle={s.personaLearningEnabled ? 'Learn your voice over the first week' : 'Persona learning is paused'}
              onPress={() => router.push('/persona' as never)}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {SwitchEl(s.personaLearningEnabled, handlePersonaLearningToggle)}
                  <CaretRight color={colors.textMuted} size={18} />
                </View>
              }
            />
            {divider}
            <SettingsRow theme={theme} icon={ChatTeardropDots} label="Chat Bubble Style" subtitle={bubbleLabel} onPress={() => setShowBubblePicker(true)} right={chevronValue(bubbleLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={Star} label="Stream Responses" subtitle="Show AI responses as they're generated" right={SwitchEl(s.streamResponses, handleStreamResponses)} />
            {divider}
            <SettingsRow theme={theme} icon={Lightning} label="Typing Indicator" subtitle="Show dots while AI is thinking" right={SwitchEl(s.showTypingIndicator, s.setShowTypingIndicator)} />
            {divider}
            <SettingsRow theme={theme} icon={FloppyDisk} label="Auto-save Chats" subtitle="Automatically save conversations" right={SwitchEl(s.autoSaveChats, handleAutoSaveChats)} />
          </GlassPanel>
        </Animated.View>

        {/* STORAGE & DATA */}
        <Animated.View entering={animation(FadeInDown.delay(300).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>Advanced Data Controls</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Database} label="Storage Used" right={<Text style={{ color: colors.textSecondary, fontSize: fontSizes.small }}>{s.getCacheSize()}</Text>} />
            {divider}
            <SettingsRow theme={theme} icon={Eraser} label="Clear Cache" subtitle="Free up storage space" onPress={handleClearCache} />
            {divider}
            <SettingsRow theme={theme} icon={ChatTeardropDots} label={`Clear Chat History (${s.sessions.length})`} subtitle="Delete local and server-side AI conversations" onPress={handleClearChats} />
            {divider}
            <SettingsRow theme={theme} icon={BookmarkSimple} label={`Clear Bookmarks (${s.bookmarkedIds.length})`} subtitle="Remove all saved echoes" onPress={handleClearBookmarks} />
            {divider}
            <SettingsRow theme={theme} icon={BellSlash} label="Clear Notifications" subtitle="Remove all notifications" onPress={handleClearNotifications} />
          </GlassPanel>
        </Animated.View>

        {/* MODERATION (moderators only) */}
        {isModerator && (
          <Animated.View entering={animation(FadeInDown.delay(350).duration(220))} style={sectionStyle}>
            <Text style={sectionHeaderStyle}>Moderation</Text>
            <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
              <SettingsRow theme={theme} icon={Gavel} label="Appeals Queue" subtitle="Review DSA Art. 20 pending appeals" onPress={() => router.push('/mod-appeals' as any)} />
            </GlassPanel>
          </Animated.View>
        )}

        {/* EU DIGITAL SERVICES ACT */}
        <Animated.View entering={animation(FadeInDown.delay(350).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>EU Digital Services Act</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Warning} label="My Reports" subtitle="Track the outcome of content reports you've filed" onPress={() => router.push('/my-reports')} />
            {divider}
            <SettingsRow theme={theme} icon={Globe} label="DSA Contact" subtitle="Contact us for DSA-related matters" onPress={() => openTrustedExternalUrl('mailto:dsa@echo.app')} />
            {divider}
            <SettingsRow theme={theme} icon={ListChecks} label="EU Legal Representative" onPress={() => openTrustedExternalUrl('https://echo.app/legal/eu-rep')} />
          </GlassPanel>
        </Animated.View>

        {/* ABOUT */}
        <Animated.View entering={animation(FadeInDown.delay(400).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>About</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Shield} label="Privacy Policy" onPress={() => openTrustedExternalUrl('https://echo.app/privacy')} />
            {divider}
            <SettingsRow theme={theme} icon={FileText} label="Terms of Service" onPress={() => openTrustedExternalUrl('https://echo.app/terms')} />
            {divider}
            <SettingsRow theme={theme} icon={Question} label="Help & Support" onPress={() => openTrustedExternalUrl('mailto:support@echo.app')} />
            {divider}
            <SettingsRow theme={theme} icon={Info} label="Version" right={<Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>1.0.0</Text>} />
          </GlassPanel>
        </Animated.View>

        {/* DANGER ZONE */}
        <Animated.View entering={animation(FadeInDown.delay(400).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>Danger Zone</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={SignOut} label="Sign Out" onPress={handleSignOut} destructive />
            {divider}
            <SettingsRow theme={theme} icon={Trash} label="Delete Account" subtitle="Permanently delete all data" onPress={handleDeleteAccount} destructive />
          </GlassPanel>
        </Animated.View>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'center', marginBottom: 32 }}>Echo v1.0.0</Text>
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
          onChange={(v) => { s.setFontSize(v); showToast(`Font size: ${v}`, 'Font'); }}
          onClose={() => setShowFontPicker(false)}
        />
      )}

      {showModelPicker && (
        <OptionPicker
          theme={theme}
          title="AI Model"
          options={[
            { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' as const, desc: 'Fast Google AI Studio model' },
            { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' as const, desc: 'More capable Google AI Studio model' },
            { label: 'Gemini 2.0 Flash Lite', value: 'gemini-2.0-flash-lite' as const, desc: 'Lightweight Google AI Studio model' },
          ]}
          value={s.aiModel}
          onChange={(v) => void handleAiModel(v)}
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
          onChange={(v) => { s.setChatBubbleStyle(v); showToast(`Bubble style: ${v}`, 'Bubble'); }}
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
          onChange={(v) => void handleDmPrivacy(v)}
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
          onChange={(v) => void handleContentLanguage(v)}
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
          onChange={(v) => { s.setFeedSort(v); showToast(`Feed: ${v}`, 'Feed'); }}
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
          onChange={(v) => { s.setRoundedCorners(v); showToast(`Corners: ${v}`, 'Corners'); }}
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
