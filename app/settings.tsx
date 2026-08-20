import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, Alert, Modal, Platform, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft, CaretRight, Bell, Vibrate, Lock, Moon, SpeakerHigh,
  Shield, Info, Question, SignOut, Trash, Eye, EyeSlash,
  ChatTeardropDots, Lightning, Translate, WifiSlash, ShieldCheck,
  Palette, TextT, SquaresFour, Star, Robot, FloppyDisk,
  ChatCircle, Broadcast, Database, Eraser, BookmarkSimple,
  BellSlash, Rectangle, FileText,
  Check, DeviceMobile, Users, Envelope, SunHorizon, UserCircle, Brain,
  Warning, ListChecks, Globe, Gavel, PencilSimple, Target, SlidersHorizontal,
  Sparkle, Microphone,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { GlassPanel } from '../components/ui/GlassPanel';
import { EncryptionKeys } from '../components/settings/EncryptionKeys';
import { IconBadge } from '../components/ui/IconBadge';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTutorialStore } from '../store/tutorialStore';
import { useOutbox } from '../store/outbox';
import { setForcedOffline, isForcedOffline } from '../lib/net';
import { drainOutbox } from '../lib/outboxProcessor';
import { useTheme, THEMES, ThemeName, getPairedTheme } from '../src/shared/lib/theme';
import { signOut } from '../lib/auth';
import { deleteRemoteAIConversations, updateRemoteProfile, fetchCurrentUserProfile } from '../lib/supabaseEchoApi';
import { syncNotificationProfile } from '../lib/personalNudges';
import { clearPushToken, registerForPush } from '../lib/push';
import { useResponsiveLayout } from '../src/shared/lib/responsive';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { captureException } from '../lib/monitoring';
import { setPersonaEnabled } from '../lib/persona';
import { track } from '../src/shared/lib/analytics';
import { isSafeExternalUrl } from '../lib/urlSafety';
import { ProfileAvatar } from '../components/ui/ProfileAvatar';
import { FONT_STYLE_OPTIONS, fontStyleLabel } from '../lib/fontPresets';
import { APP_LANGUAGES, CONTENT_LANGUAGE_OPTIONS, languageLabel, type AppLanguageCode } from '../lib/languages';
import { useI18n , ttx } from '../src/shared/lib/i18n';
import { speak } from '../lib/tts';

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@echo.app';
const DSA_EMAIL = process.env.EXPO_PUBLIC_DSA_EMAIL || 'dsa@echo.app';
type SettingsGroup = 'all' | 'essentials' | 'privacy' | 'display' | 'feed' | 'ai' | 'data' | 'support';

function openTrustedExternalUrl(url: string): void {
  if (!isSafeExternalUrl(url)) return;
  void Linking.openURL(url);
}

function SettingsRow({ icon: Icon, iconColor, label, subtitle, right, onPress, destructive, theme }: {
  icon: any; label: string; iconColor?: string; subtitle?: string;
  right?: React.ReactNode; onPress?: () => void; destructive?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const { colors, radius, fontSizes, font } = theme;
  const resolvedIconColor = destructive ? colors.danger : (iconColor || colors.textSecondary);
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
      <IconBadge
        color={resolvedIconColor}
        size={38}
        radius={radius.md}
        muted={!destructive}
        style={{ marginRight: 12 }}
      >
        <Icon color={destructive ? '#fff' : resolvedIconColor} size={18} weight={iconColor || destructive ? 'bold' : 'regular'} />
      </IconBadge>
      <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
        <Text style={[font.bodySemibold, { color: destructive ? colors.danger : colors.text, fontSize: fontSizes.body }]} numberOfLines={1}>{label}</Text>
        {subtitle && <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {right || (onPress && <CaretRight color={colors.textMuted} size={18} />)}
    </AnimatedPressable>
  );
}

function SettingsHero({
  theme,
  displayName,
  username,
  avatarColor,
  avatarUrl,
  profilePhotoVisible,
  modelLabel,
  notificationsEnabled,
  privateAccount,
  onEditProfile,
  onTarget,
  onAiMemory,
}: {
  theme: ReturnType<typeof useTheme>;
  displayName: string;
  username: string;
  avatarColor: string;
  avatarUrl?: string;
  profilePhotoVisible: boolean;
  modelLabel: string;
  notificationsEnabled: boolean;
  privateAccount: boolean;
  onEditProfile: () => void;
  onTarget: () => void;
  onAiMemory: () => void;
}) {
  const { colors, radius, font } = theme;
  const { t } = useI18n();
  const visibleAvatar = profilePhotoVisible ? avatarUrl : undefined;
  const quickActions = [
    { label: t('settings.editProfile'), subtitle: `@${username}`, icon: PencilSimple, color: colors.accent, onPress: onEditProfile },
    { label: t('settings.targetTools'), subtitle: 'Progress', icon: Target, color: '#7A8B4E', onPress: onTarget },
    { label: t('settings.aiMemory'), subtitle: modelLabel.replace('Gemini 2.5 ', ''), icon: Brain, color: '#8B5E7D', onPress: onAiMemory },
  ];

  return (
    <View style={{ overflow: 'visible', backgroundColor: 'transparent', marginBottom: 28 }}>
      <LinearGradient
        colors={[`${colors.accent}30`, `${colors.accent}08`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: -40, left: -20, right: -20, bottom: -40 }}
        pointerEvents="none"
      />
      <View style={{ padding: 18, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <ProfileAvatar
            displayName={displayName || username || 'Echo'}
            avatarColor={avatarColor}
            avatarUrl={visibleAvatar}
            size={62}
            showHalo
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[font.display, { color: colors.text, fontSize: 28, lineHeight: 33 }]} numberOfLines={1}>
              {t('settings.title')}
            </Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 }]} numberOfLines={2}>
              {t('settings.subtitle')}
            </Text>
          </View>
        </View>

        {}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {quickActions.map(action => {
            const Icon = action.icon;
            return (
              <AnimatedPressable
                key={action.label}
                onPress={action.onPress}
                style={{
                  flex: 1,
                  minHeight: 86,
                  borderRadius: radius.lg,
                  backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  padding: 12,
                  justifyContent: 'space-between',
                }}
                scaleValue={0.96}
                haptic="light"
              >
                <IconBadge color={action.color} size={36} radius={13}>
                  <Icon color="#fff" size={18} weight="bold" />
                </IconBadge>
                <View>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 13 }]} numberOfLines={1}>{action.label}</Text>
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 11, marginTop: 2 }]} numberOfLines={1}>{action.subtitle}</Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function SettingsCategoryRail({
  active,
  onChange,
  theme,
}: {
  active: SettingsGroup;
  onChange: (group: SettingsGroup) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const { colors, font } = theme;
  const { t } = useI18n();
  const groups: { key: SettingsGroup; label: string; icon: any }[] = [
    { key: 'all', label: t('settings.groups.all'), icon: SlidersHorizontal },
    { key: 'essentials', label: t('settings.groups.essentials'), icon: Bell },
    { key: 'privacy', label: t('settings.groups.privacy'), icon: ShieldCheck },
    { key: 'display', label: t('settings.groups.display'), icon: Palette },
    { key: 'feed', label: t('settings.groups.feed'), icon: SquaresFour },
    { key: 'ai', label: t('settings.groups.ai'), icon: Robot },
    { key: 'data', label: t('settings.groups.data'), icon: Database },
    { key: 'support', label: t('settings.groups.support'), icon: Question },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
    >
      {groups.map(group => {
        const activeGroup = active === group.key;
        const Icon = group.icon;
        return (
          <AnimatedPressable
            key={group.key}
            onPress={() => onChange(group.key)}
            style={{
              minHeight: 40,
              borderRadius: 999,
              paddingHorizontal: 13,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              backgroundColor: activeGroup ? colors.accent : colors.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: activeGroup ? colors.accent : colors.border,
            }}
            scaleValue={0.95}
            haptic="light"
            accessibilityRole="button"
            accessibilityState={{ selected: activeGroup }}
          >
            <Icon color={activeGroup ? '#fff' : colors.textSecondary} size={16} weight={activeGroup ? 'bold' : 'regular'} />
            <Text style={[font.bodyBold, { color: activeGroup ? '#fff' : colors.textSecondary, fontSize: 13 }]}>{group.label}</Text>
          </AnimatedPressable>
        );
      })}
    </ScrollView>
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
          <View style={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16, maxHeight: '82%' }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.glassBorder, marginBottom: 16 }} />
            <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '700', marginBottom: 16, marginLeft: 4 }}>{title}</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {options.map(opt => {
                const active = value === opt.value;
                return (
                  <AnimatedPressable
                    key={opt.value}
                    onPress={() => { onChange(opt.value); onClose(); }}
                    style={{
                      minHeight: opt.desc ? 62 : 52,
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      marginBottom: 7,
                      borderRadius: radius.md,
                      backgroundColor: active ? colors.accentMuted : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                      borderWidth: active ? 1 : StyleSheet.hairlineWidth,
                      borderColor: active ? colors.accent : colors.glassBorder,
                    }}
                    scaleValue={0.97}
                    haptic="light"
                  >
                    <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                      <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }} numberOfLines={1}>
                        {opt.label || String(opt.value)}
                      </Text>
                      {opt.desc && (
                        <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, marginTop: 3 }} numberOfLines={1}>
                          {opt.desc}
                        </Text>
                      )}
                    </View>
                    {active && <Check color={colors.accent} size={20} />}
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </View>
        </Animated.View>
      </AnimatedPressable>
    </Modal>
  );
}



const ACCENT_COLORS = [
  { color: '#C65F3F', name: 'Terracotta' },
  { color: '#B08536', name: 'Ochre' },
  { color: '#7A8B4E', name: 'Olive' },
  { color: '#4E8B7A', name: 'Sage' },
  { color: '#4E7A8B', name: 'Steel' },
  { color: '#5E748B', name: 'Dusk' },
  { color: '#8B5E7D', name: 'Plum' },
  { color: '#B35D6B', name: 'Rose' },
  { color: '#A04E4E', name: 'Brick' },
  { color: '#8B6F4E', name: 'Caramel' },
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
          <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>{ttx("Accent Color")}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginBottom: 16, marginLeft: 4 }}>{ttx("Choose the accent color used throughout the app")}</Text>
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


function ThemePicker({ value, onChange, onClose, theme }: {
  value: ThemeName; onChange: (v: ThemeName) => void; onClose: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const { colors, radius, fontSizes, animation } = theme;
  const themeOrder: ThemeName[] = ['midnight', 'amoled', 'tokyonight', 'rosepine', 'nord'];

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
          <View style={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16, maxHeight: '82%' }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.glassBorder, marginBottom: 16 }} />
            <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>{ttx("Choose Theme")}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginBottom: 16, marginLeft: 4 }}>{ttx("Pick a color palette that matches your taste")}</Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {themeOrder.map(key => {
                const t = getPairedTheme(key, theme.colors.isDark);
                const active = value === key;
                return (
                  <AnimatedPressable
                    key={key}
                    onPress={() => { onChange(key); onClose(); showToast(`Theme: ${THEMES[key].name}`, 'Theme'); }}
                    scaleValue={0.95}
                    haptic="medium"
                    style={{
                      width: '48%',
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ 
                      backgroundColor: t.bg, 
                      padding: 12,
                      borderRadius: radius.card,
                      overflow: 'hidden',
                      borderWidth: 2,
                      borderColor: active ? t.accent : 'transparent',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <View style={{ backgroundColor: t.accent, width: 24, height: 24, borderRadius: 999, marginRight: 8 }} />
                        <Text style={{ color: t.text, fontWeight: '700', fontSize: fontSizes.body, flex: 1 }}>{THEMES[key].name}</Text>
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
            </ScrollView>
          </View>
        </Animated.View>
      </AnimatedPressable>
    </Modal>
  );
}


export default function SettingsScreen() {
  const router = useRouter();
  const s = useAppStore();
  const theme = useTheme();
  const { t } = useI18n();
  
  const [forceOffline, setForceOfflineState] = useState(isForcedOffline());
  const outboxPending = useOutbox(o => o.ops.filter(op => op.status === 'pending').length);
  const { colors, radius, fontSizes, switchTrack, animation } = theme;
  const layout = useResponsiveLayout();

  const [isModerator, setIsModerator] = useState(false);

  useEffect(() => {
    if (!isSupabaseRemote()) return;
    let cancelled = false;
    
    
    const probe = (attempt: number) => {
      fetchCurrentUserProfile()
        .then(p => { if (!cancelled && p?.is_moderator) setIsModerator(true); })
        .catch(e => {
          if (cancelled) return;
          if (attempt === 0) setTimeout(() => probe(1), 1500);
          else captureException(e, { tags: { source: 'settings_moderator_probe' } });
        });
    };
    probe(0);
    return () => { cancelled = true; };
  }, []);

  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showFontStylePicker, setShowFontStylePicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showBubblePicker, setShowBubblePicker] = useState(false);
  const [showDmPicker, setShowDmPicker] = useState(false);
  const [showAppLanguagePicker, setShowAppLanguagePicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showFeedSortPicker, setShowFeedSortPicker] = useState(false);
  const [showCornerPicker, setShowCornerPicker] = useState(false);
  const [showAccentPicker, setShowAccentPicker] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [activeGroup, setActiveGroup] = useState<SettingsGroup>('all');

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await signOut();
          
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    
    
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

  const handlePersonalizedNotifications = async (enabled: boolean) => {
    const prev = s.personalizedNotifications;
    s.setPersonalizedNotifications(enabled);
    if (!isSupabaseRemote()) return;
    try {
      await updateRemoteProfile({ personalized_notifications: enabled });
      
      void syncNotificationProfile(enabled);
    } catch (e) {
      s.setPersonalizedNotifications(prev);
      Alert.alert('Could not update setting', (e as Error).message);
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

  const handleAiModel = async (v: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite') => {
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

  const handleAppLanguage = (v: AppLanguageCode) => {
    s.setAppLanguage(v);
    showToast(languageLabel(v), t('settings.languageChanged'));
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
  const fontStyleValue = s.fontStyle ?? 'editorial';
  const fontStyleText = fontStyleLabel(fontStyleValue);
  const modelLabel = {
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  }[s.aiModel];
  const bubbleLabel = { modern: 'Modern', classic: 'Classic', minimal: 'Minimal' }[s.chatBubbleStyle];
  const dmLabel = { everyone: 'Everyone', followers: 'Followers Only', nobody: 'Nobody' }[s.dmPrivacy];
  const feedLabel = { latest: 'Latest', popular: 'Popular', following: 'Following' }[s.feedSort];
  const cornerLabel = { small: 'Small', medium: 'Medium', large: 'Large' }[s.roundedCorners];
  const themeLabel = THEMES[s.theme]?.name ?? 'Midnight';
  const appLanguageLabel = languageLabel(s.appLanguage);
  const RATE_STEPS = [0.75, 1, 1.25];
  const rateLabel = (r: number) => (r <= 0.85 ? 'Slow' : r >= 1.15 ? 'Fast' : 'Normal');
  const cycleSpeechRate = () => {
    const idx = RATE_STEPS.findIndex((x) => Math.abs(x - s.speechRate) < 0.06);
    const next = RATE_STEPS[(idx + 1) % RATE_STEPS.length] ?? 1;
    s.setSpeechRate(next);
    
    speak(t('voice.sample'), { language: s.appLanguage, rate: next });
  };
  const showGroup = (...groups: SettingsGroup[]) => activeGroup === 'all' || groups.includes(activeGroup);

  const sectionHeaderStyle = {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
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
    ? { flexBasis: 420, flexGrow: 1, flexShrink: 1 }
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
      <View style={{ backgroundColor: 'transparent', paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: layout.isMacDesktop ? 84 : 16,
            paddingRight: 16,
            paddingVertical: layout.isDesktop ? 14 : 12,
            gap: 12,
          }}
        >
          <AnimatedPressable onPress={() => router.back()} style={{ padding: 4 }} scaleValue={0.88} haptic="light">
            <ArrowLeft color={colors.text} size={28} />
          </AnimatedPressable>
          <Text style={{ color: colors.text, fontSize: layout.isPhone ? 32 : 36, fontFamily: 'Fraunces_900Black', letterSpacing: -0.5 }}>{t('settings.title')}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={scrollContentStyle}>
        <SettingsHero
          theme={theme}
          displayName={s.displayName || s.username}
          username={s.username}
          avatarColor={s.avatarColor}
          avatarUrl={s.avatarUrl || undefined}
          profilePhotoVisible={s.profilePhotoVisible}
          modelLabel={modelLabel}
          notificationsEnabled={s.notificationsEnabled}
          privateAccount={s.privateAccount}
          onEditProfile={() => router.push('/edit-profile')}
          onTarget={() => router.push('/target-progress' as never)}
          onAiMemory={() => router.push('/ai-memory')}
        />
        <SettingsCategoryRail active={activeGroup} onChange={setActiveGroup} theme={theme} />
        <View style={sectionGridStyle}>
        {}
        {showGroup('essentials') && <Animated.View entering={animation(FadeInDown.delay(50).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>{ttx("Essentials")}</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Bell} iconColor={colors.accent} label={ttx("Push Notifications")} subtitle={s.notificationsEnabled ? 'On' : 'Off'} right={SwitchEl(s.notificationsEnabled, handlePushToggle)} />
            {divider}
            <SettingsRow theme={theme} icon={Vibrate} label={ttx("Haptic Feedback")} subtitle={ttx("Vibration on interactions")} right={SwitchEl(s.hapticEnabled, s.setHapticEnabled)} />
            {divider}
            <SettingsRow theme={theme} icon={SpeakerHigh} label={ttx("Sound Effects")} subtitle={ttx("Play sounds for actions")} right={SwitchEl(s.soundEnabled, s.setSoundEnabled)} />
            {divider}
            <SettingsRow theme={theme} icon={SpeakerHigh} label={ttx("Read-aloud speed")} subtitle={ttx("How fast Echo speaks content")} onPress={cycleSpeechRate} right={chevronValue(rateLabel(s.speechRate))} />
            {divider}
            <SettingsRow theme={theme} icon={SpeakerHigh} label={ttx("Auto-read AI replies")} subtitle={ttx("Speak each answer aloud when it finishes")} right={SwitchEl(s.autoReadAiReplies, s.setAutoReadAiReplies)} />
            {divider}
            <SettingsRow theme={theme} icon={SpeakerHigh} label={ttx("Auto-read messages")} subtitle={ttx("Read incoming DMs aloud while a chat is open")} right={SwitchEl(s.autoReadMessages, s.setAutoReadMessages)} />
            {divider}
            <SettingsRow theme={theme} icon={Microphone} label={ttx("Voice captions")} subtitle={ttx("Show what you said on screen after speaking")} right={SwitchEl(s.voiceCaptions, s.setVoiceCaptions)} />
            {divider}
            <SettingsRow theme={theme} icon={Bell} label={ttx("Notification Preferences")} subtitle={ttx("Customize which notifications you receive")} onPress={() => router.push('/notification-prefs')} />
            {divider}
            <SettingsRow theme={theme} icon={Lock} iconColor="#B08536" label={ttx("Private Account")} subtitle={ttx("Safer default while you're learning the app")} right={SwitchEl(s.privateAccount, handlePrivateAccount)} />
            {divider}
            <SettingsRow theme={theme} icon={ShieldCheck} iconColor={colors.success} label={ttx("Sensitive Content Filter")} subtitle={ttx("Filter potentially sensitive content")} right={SwitchEl(s.sensitiveContentFilter, handleSensitiveContentFilter)} />
          </GlassPanel>
        </Animated.View>}

        {}
        {showGroup('privacy') && <Animated.View entering={animation(FadeInDown.delay(150).duration(220))} style={sectionStyle}><EncryptionKeys /></Animated.View>}

        {showGroup('privacy') && <Animated.View entering={animation(FadeInDown.delay(100).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>{ttx("Privacy & Safety")}</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Eye} label={ttx("Activity Status")} subtitle={ttx("Show when you're online")} right={SwitchEl(s.activityStatus, handleActivityStatus)} />
            {divider}
            <SettingsRow theme={theme} icon={EyeSlash} label={ttx("Online Status")} subtitle={ttx("Let others see your online indicator")} right={SwitchEl(s.onlineStatus, handleOnlineStatus)} />
            {divider}
            <SettingsRow
              theme={theme}
              icon={UserCircle}
              iconColor={colors.accent}
              label={ttx("Profile Photo")}
              subtitle={s.profilePhotoVisible ? 'Visible on profile and feed' : 'Hidden from other users'}
              right={SwitchEl(s.profilePhotoVisible, handleProfilePhotoVisibleToggle)}
            />
            {divider}
            <SettingsRow theme={theme} icon={ChatCircle} label={ttx("Read Receipts")} subtitle={ttx("Show when you've read messages")} right={SwitchEl(s.readReceipts, handleReadReceipts)} />
            {divider}
            <SettingsRow theme={theme} icon={Sparkle} iconColor={colors.accent} label={ttx("Personalized Notifications")} subtitle={ttx("Let Echo learn your best times and interests to time reminders. Off by default; no profiling until you turn it on.")} right={SwitchEl(s.personalizedNotifications, handlePersonalizedNotifications)} />
            {divider}
            <SettingsRow theme={theme} icon={Envelope} label={ttx("Who Can Message You")} subtitle={dmLabel} onPress={() => setShowDmPicker(true)} right={chevronValue(dmLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={Users} label={`Blocked Users (${s.blockedIds.length})`} subtitle={ttx("Manage users you've blocked")} onPress={() => router.push('/blocked-users')} />
            {divider}
            <SettingsRow theme={theme} icon={Users} label={`Muted Users (${s.mutedIds.length})`} subtitle={ttx("Hide their echoes without notifying them")} onPress={() => router.push('/muted-users')} />
          </GlassPanel>
        </Animated.View>}

        {}
        {showGroup('display') && <Animated.View entering={animation(FadeInDown.delay(150).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>{ttx("Accessibility & Display")}</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow
              theme={theme}
              icon={SunHorizon}
              iconColor={colors.accent}
              label={ttx("Theme")}
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
            <SettingsRow theme={theme} icon={Moon} iconColor="#8B5E7D" label={ttx("Dark Mode")} subtitle={ttx("Always on for OLED savings")} right={SwitchEl(s.darkMode, s.setDarkMode)} />
            {divider}
            <SettingsRow theme={theme} icon={DeviceMobile} label={ttx("Pure Black Background")} subtitle={ttx("True black for AMOLED screens")} right={SwitchEl(s.pureBlackBackground, s.setPureBlackBackground)} />
            {divider}
            <SettingsRow
              theme={theme}
              icon={Palette}
              iconColor={s.accentColor}
              label={ttx("Accent Color")}
              subtitle={ttx("Customize the app's accent color")}
              onPress={() => setShowAccentPicker(true)}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 20, height: 20, borderRadius: 999, marginRight: 8, backgroundColor: s.accentColor }} />
                  <CaretRight color={colors.textMuted} size={18} />
                </View>
              }
            />
            {divider}
            <SettingsRow theme={theme} icon={TextT} label={ttx("Font Size")} subtitle={fontLabel} onPress={() => setShowFontPicker(true)} right={chevronValue(fontLabel)} />
            {divider}
            <SettingsRow
              theme={theme}
              icon={TextT}
              iconColor={colors.accent}
              label={ttx("Font Style")}
              subtitle={ttx("Choose the typography personality across Echo")}
              onPress={() => setShowFontStylePicker(true)}
              right={chevronValue(fontStyleText)}
            />
            {divider}
            <SettingsRow theme={theme} icon={Rectangle} label={ttx("Corner Radius")} subtitle={`${cornerLabel} rounded corners`} onPress={() => setShowCornerPicker(true)} right={chevronValue(cornerLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={Eye} label={ttx("Show Avatars")} subtitle={ttx("Display user avatar icons")} right={SwitchEl(s.showAvatars, s.setShowAvatars)} />
            {divider}
            <SettingsRow theme={theme} icon={SquaresFour} label={ttx("Show Preview Cards")} subtitle={ttx("Show response previews in feed")} right={SwitchEl(s.showPreviewCards, s.setShowPreviewCards)} />
            {divider}
            <SettingsRow theme={theme} icon={Lightning} label={ttx("Reduce Animations")} subtitle={ttx("Minimize motion effects")} right={SwitchEl(s.reduceAnimations, s.setReduceAnimations)} />
            <SettingsRow theme={theme} icon={Sparkle} label={ttx("Glass Theme")} subtitle={ttx("Enable blurred backgrounds (requires high-end device)")} right={SwitchEl(s.glassTheme, s.setGlassTheme)} />
          </GlassPanel>
        </Animated.View>}

        {}
        {showGroup('feed') && <Animated.View entering={animation(FadeInDown.delay(200).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>{ttx("Content & Feed")}</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Globe} iconColor={colors.accent} label={t('settings.appLanguage')} subtitle={t('settings.appLanguageSubtitle')} onPress={() => setShowAppLanguagePicker(true)} right={chevronValue(appLanguageLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={SquaresFour} label={ttx("Feed Sort")} subtitle={`Show ${feedLabel.toLowerCase()} posts first`} onPress={() => setShowFeedSortPicker(true)} right={chevronValue(feedLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={SquaresFour} label={ttx("Compact Feed")} subtitle={ttx("Show smaller cards in the feed")} right={SwitchEl(s.compactFeed, s.setCompactFeed)} />
            {divider}
            <SettingsRow theme={theme} icon={Broadcast} label={ttx("Autoplay Stories")} subtitle={ttx("Auto-advance through stories")} right={SwitchEl(s.autoplayStories, s.setAutoplayStories)} />
            {divider}
            <SettingsRow theme={theme} icon={Translate} label={t('settings.contentLanguage')} subtitle={t('settings.contentLanguageSubtitle')} onPress={() => setShowLanguagePicker(true)} right={chevronValue(s.contentLanguage)} />
            {divider}
            <SettingsRow theme={theme} icon={WifiSlash} label={ttx("Data Saver")} subtitle={ttx("Reduce data usage on mobile")} right={SwitchEl(s.dataSaver, s.setDataSaver)} />
          </GlassPanel>
        </Animated.View>}

        {}
        {showGroup('ai') && <Animated.View entering={animation(FadeInDown.delay(250).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>{ttx("Chat & AI")}</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Robot} iconColor={colors.accent} label={ttx("AI Model")} subtitle={modelLabel} onPress={() => setShowModelPicker(true)} right={chevronValue(modelLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={Database} iconColor={colors.accent} label={ttx("AI Memory")} subtitle={ttx("View and clear remembered preferences")} onPress={() => router.push('/ai-memory')} />
            {divider}
            <SettingsRow
              theme={theme}
              icon={Brain}
              iconColor={colors.accent}
              label={ttx("Personal Persona")}
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
            <SettingsRow theme={theme} icon={ChatTeardropDots} label={ttx("Chat Bubble Style")} subtitle={bubbleLabel} onPress={() => setShowBubblePicker(true)} right={chevronValue(bubbleLabel)} />
            {divider}
            <SettingsRow theme={theme} icon={Star} label={ttx("Stream Responses")} subtitle={ttx("Show AI responses as they're generated")} right={SwitchEl(s.streamResponses, handleStreamResponses)} />
            {divider}
            <SettingsRow theme={theme} icon={Lightning} label={ttx("Typing Indicator")} subtitle={ttx("Show dots while AI is thinking")} right={SwitchEl(s.showTypingIndicator, s.setShowTypingIndicator)} />
            {divider}
            <SettingsRow theme={theme} icon={FloppyDisk} label={ttx("Auto-save Chats")} subtitle={ttx("Automatically save conversations")} right={SwitchEl(s.autoSaveChats, handleAutoSaveChats)} />
          </GlassPanel>
        </Animated.View>}

        {}
        {showGroup('data') && <Animated.View entering={animation(FadeInDown.delay(300).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>{ttx("Advanced Data Controls")}</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Database} label={ttx("Storage Used")} right={<Text style={{ color: colors.textSecondary, fontSize: fontSizes.small }}>{s.getCacheSize()}</Text>} />
            {divider}
            <SettingsRow theme={theme} icon={Eraser} label={ttx("Clear Cache")} subtitle={ttx("Free up storage space")} onPress={handleClearCache} />
            {divider}
            <SettingsRow theme={theme} icon={ChatTeardropDots} label={`Clear Chat History (${s.sessions.length})`} subtitle={ttx("Delete local and server-side AI conversations")} onPress={handleClearChats} />
            {divider}
            <SettingsRow theme={theme} icon={BookmarkSimple} label={`Clear Bookmarks (${s.bookmarkedIds.length})`} subtitle={ttx("Remove all saved echoes")} onPress={handleClearBookmarks} />
            {divider}
            <SettingsRow theme={theme} icon={BellSlash} label={ttx("Clear Notifications")} subtitle={ttx("Remove all notifications")} onPress={handleClearNotifications} />
          </GlassPanel>
        </Animated.View>}

        {}
        {isModerator && showGroup('support') && (
          <Animated.View entering={animation(FadeInDown.delay(350).duration(220))} style={sectionStyle}>
            <Text style={sectionHeaderStyle}>{ttx("Moderation")}</Text>
            <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
              <SettingsRow theme={theme} icon={Gavel} label={ttx("Appeals Queue")} subtitle={ttx("Review DSA Art. 20 pending appeals")} onPress={() => router.push('/mod-appeals' as any)} />
            </GlassPanel>
          </Animated.View>
        )}

        {}
        {showGroup('support') && <Animated.View entering={animation(FadeInDown.delay(350).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>{ttx("EU Digital Services Act")}</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Warning} label={ttx("My Reports")} subtitle={ttx("Track the outcome of content reports you've filed")} onPress={() => router.push('/my-reports')} />
            {divider}
            <SettingsRow theme={theme} icon={Globe} label={ttx("DSA Contact")} subtitle={ttx("Contact us for DSA-related matters")} onPress={() => openTrustedExternalUrl(`mailto:${DSA_EMAIL}`)} />
            {divider}
            <SettingsRow theme={theme} icon={ListChecks} label={ttx("EU Legal Representative")} onPress={() => router.push('/legal/eu-rep')} />
          </GlassPanel>
        </Animated.View>}

        {}
        {showGroup('support') && <Animated.View entering={animation(FadeInDown.delay(400).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>{ttx("About")}</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={Shield} label={ttx("Privacy Policy")} onPress={() => router.push('/privacy')} />
            {divider}
            <SettingsRow theme={theme} icon={FileText} label={ttx("Terms of Service")} onPress={() => router.push('/terms')} />
            {divider}
            <SettingsRow theme={theme} icon={Question} label={ttx("Help & Support")} onPress={() => openTrustedExternalUrl(`mailto:${SUPPORT_EMAIL}`)} />
            {divider}
            <SettingsRow theme={theme} icon={Sparkle} label={t('settings.replayTour')} subtitle={t('settings.replayTourSubtitle')} onPress={() => { router.push('/(tabs)/home'); setTimeout(() => useTutorialStore.getState().startTour('home'), 450); }} />
            {divider}
            {__DEV__ && (
              <SettingsRow
                theme={theme}
                icon={WifiSlash}
                label={ttx("Simulate offline (dev)")}
                subtitle={`Outbox pending: ${outboxPending}`}
                right={SwitchEl(forceOffline, (v: boolean) => { setForcedOffline(v); setForceOfflineState(v); if (!v) void drainOutbox(); })}
              />
            )}
            {__DEV__ && divider}
            <SettingsRow theme={theme} icon={Info} label={ttx("Version")} right={<Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>1.0.0</Text>} />
          </GlassPanel>
        </Animated.View>}

        {}
        {showGroup('support', 'data') && <Animated.View entering={animation(FadeInDown.delay(400).duration(220))} style={sectionStyle}>
          <Text style={sectionHeaderStyle}>{ttx("Danger Zone")}</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 20 }} contentStyle={{ paddingHorizontal: 16 }}>
            <SettingsRow theme={theme} icon={SignOut} label={ttx("Sign Out")} onPress={handleSignOut} destructive />
            {divider}
            <SettingsRow theme={theme} icon={Trash} label={ttx("Delete Account")} subtitle={ttx("Permanently delete all data")} onPress={handleDeleteAccount} destructive />
          </GlassPanel>
        </Animated.View>}
        </View>

        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'center', marginBottom: 32 }}>{ttx("Echo v1.0.0")}</Text>
      </ScrollView>

      {}
      {showThemePicker && (
        <ThemePicker value={s.theme} onChange={s.setTheme} onClose={() => setShowThemePicker(false)} theme={theme} />
      )}

      {showFontPicker && (
        <OptionPicker
          theme={theme}
          title={ttx("Font Size")}
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

      {showFontStylePicker && (
        <OptionPicker
          theme={theme}
          title={ttx("Font Style")}
          options={FONT_STYLE_OPTIONS}
          value={fontStyleValue}
          onChange={(v) => { s.setFontStyle(v); showToast(`Font style: ${fontStyleLabel(v)}`, 'Typography'); }}
          onClose={() => setShowFontStylePicker(false)}
        />
      )}

      {showModelPicker && (
        <OptionPicker
          theme={theme}
          title={ttx("AI Model")}
          options={[
            { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' as const, desc: 'Fast Google AI Studio model' },
            { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' as const, desc: 'More capable Google AI Studio model' },
            { label: 'Gemini 2.5 Flash Lite', value: 'gemini-2.5-flash-lite' as const, desc: 'Lightweight Google AI Studio model' },
          ]}
          value={s.aiModel}
          onChange={(v) => void handleAiModel(v)}
          onClose={() => setShowModelPicker(false)}
        />
      )}

      {showBubblePicker && (
        <OptionPicker
          theme={theme}
          title={ttx("Chat Bubble Style")}
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
          title={ttx("Who Can Message You")}
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

      {showAppLanguagePicker && (
        <OptionPicker
          theme={theme}
          title={t('settings.chooseAppLanguage')}
          options={APP_LANGUAGES.map(language => ({
            label: `${language.englishName} (${language.nativeName})`,
            value: language.code,
            desc: language.region === 'India' ? t('common.indianLanguage') : t('common.globalLanguage'),
          }))}
          value={s.appLanguage}
          onChange={handleAppLanguage}
          onClose={() => setShowAppLanguagePicker(false)}
        />
      )}

      {showLanguagePicker && (
        <OptionPicker
          theme={theme}
          title={t('settings.chooseContentLanguage')}
          options={CONTENT_LANGUAGE_OPTIONS}
          value={s.contentLanguage}
          onChange={(v) => void handleContentLanguage(v)}
          onClose={() => setShowLanguagePicker(false)}
        />
      )}

      {showFeedSortPicker && (
        <OptionPicker
          theme={theme}
          title={ttx("Feed Sort Order")}
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
          title={ttx("Corner Radius")}
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
