import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, Camera, TextAlignLeft, UserCircle } from 'phosphor-react-native';
import { TextInput } from '../components/ui/TextInput';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../components/ui/ProfileAvatar';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { fetchRemoteProfile, updateRemoteProfile, uploadAvatar } from '../lib/supabaseEchoApi';
import { supabase } from '../lib/supabase';
import { useResponsiveLayout } from '../lib/responsive';

const AVATAR_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#14B8A6', '#F97316', '#6366F1',
];

const BIO_MAX = 160;
const BIO_WARN = 140;
const MOOD_MAX = 60;
const PRONOUN_PRESETS = ['', 'she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any/all'];

export default function EditProfileScreen() {
  const router = useRouter();
  const { username, displayName, bio, avatarColor, avatarUrl, profilePhotoVisible, setUsername, setDisplayName, setBio, setAvatarColor, setAvatarUrl } = useAppStore();
  const { colors, radius, fontSizes, font, animation } = useTheme();
  const layout = useResponsiveLayout();

  const [newUsername, setNewUsername] = useState(username);
  const [newDisplayName, setNewDisplayName] = useState(displayName || username);
  const [newBio, setNewBio] = useState(bio);
  const [newColor, setNewColor] = useState(avatarColor);
  const [newAvatarUrl, setNewAvatarUrl] = useState(avatarUrl || '');
  const [newPronouns, setNewPronouns] = useState('');
  const [newMood, setNewMood] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate remote-only profile fields on mount.
  useEffect(() => {
    if (!isSupabaseRemote()) return;
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const profile = await fetchRemoteProfile(user.id);
        if (profile?.pronouns) setNewPronouns(profile.pronouns);
        if (profile?.mood && profile.mood_expires_at && new Date(profile.mood_expires_at).getTime() > Date.now()) {
          setNewMood(profile.mood);
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.72,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const localUri = asset.uri;

    if (!isSupabaseRemote()) {
      // Offline-only: just use local URI as preview (won't persist beyond session)
      setNewAvatarUrl(localUri);
      return;
    }

    setUploadingAvatar(true);
    try {
      const publicUrl = await uploadAvatar({
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });
      setNewAvatarUrl(publicUrl);
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const usernameValid = newUsername.trim().length >= 2;
  const bioProgress = newBio.length / BIO_MAX;
  const bioNearLimit = newBio.length > BIO_WARN;
  const completionItems = [
    { label: 'Name', done: !!newDisplayName.trim() },
    { label: 'Username', done: usernameValid },
    { label: 'Bio', done: !!newBio.trim() },
    { label: 'Photo', done: !!newAvatarUrl && profilePhotoVisible },
  ];
  const completion = completionItems.filter(item => item.done).length / completionItems.length;

  const handleSave = async () => {
    if (!usernameValid) {
      Alert.alert('Error', 'Username must be at least 2 characters.');
      return;
    }
    if (isSupabaseRemote()) {
      setSaving(true);
      try {
        const trimmedMood = newMood.trim().slice(0, MOOD_MAX);
        await updateRemoteProfile({
          username: newUsername.trim().toLowerCase(),
          display_name: newDisplayName.trim() || newUsername.trim(),
          bio: newBio.trim(),
          avatar_color: newColor,
          pronouns: newPronouns.trim() ? newPronouns.trim() : null,
          mood: trimmedMood || null,
          mood_expires_at: trimmedMood
            ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            : null,
          avatar_url: profilePhotoVisible && newAvatarUrl ? newAvatarUrl : null,
        });
      } catch (e) {
        Alert.alert('Could not save', (e as Error).message);
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setUsername(newUsername.trim());
    setDisplayName(newDisplayName.trim() || newUsername.trim());
    setBio(newBio.trim());
    setAvatarColor(newColor);
    if (newAvatarUrl) setAvatarUrl(newAvatarUrl);
    showToast('Profile updated!', 'Saved');
    router.back();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        className="flex-row items-center justify-between px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <AnimatedPressable onPress={() => router.back()} className="p-1" scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontSize: 20, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4 }}>Edit Profile</Text>
        <AnimatedPressable
          onPress={() => { void handleSave(); }}
          disabled={saving}
          className="flex-row items-center gap-1.5 px-4 py-2"
          style={{
            borderRadius: radius.lg,
            backgroundColor: saving ? colors.surfaceHover : colors.accent,
          }}
          scaleValue={0.93}
          haptic="medium"
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Check color="#fff" size={16} />
          )}
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: fontSizes.small }}>Save</Text>
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.isDesktop ? 640 : layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: 18,
          paddingBottom: layout.bottomChromePadding,
          gap: 16,
        }}
      >
        <Animated.View entering={animation(FadeInDown.delay(80).duration(220))} style={{ borderRadius: 28, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface }}>
          <LinearGradient
            colors={[`${newColor}4A`, `${newColor}16`, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={{ padding: 18, gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <AnimatedPressable
                onPress={() => { void handlePickAvatar(); }}
                disabled={uploadingAvatar}
                style={{ position: 'relative' }}
                scaleValue={0.95}
                haptic="light"
              >
                <ProfileAvatar
                  displayName={newDisplayName || newUsername || '?'}
                  avatarColor={newColor}
                  avatarUrl={newAvatarUrl || undefined}
                  size={82}
                  showHalo
                />
                <View style={{
                  position: 'absolute', bottom: 2, right: 2,
                  backgroundColor: colors.accent, borderRadius: 15, padding: 6,
                  borderWidth: 2, borderColor: colors.bg,
                }}>
                  {uploadingAvatar
                    ? <ActivityIndicator size="small" color="#fff" style={{ width: 14, height: 14 }} />
                    : <Camera size={14} color="#fff" weight="fill" />
                  }
                </View>
              </AnimatedPressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[font.display, { color: colors.text, fontSize: 30, lineHeight: 35 }]} numberOfLines={1}>
                  {newDisplayName || newUsername || 'Your profile'}
                </Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 13, marginTop: 4 }]} numberOfLines={1}>
                  @{newUsername.trim().toLowerCase() || 'username'}
                </Text>
                {!!newMood.trim() && (
                  <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 12, marginTop: 8 }]} numberOfLines={1}>
                    {newMood.trim()}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.surfaceHover, overflow: 'hidden' }}>
                <View style={{ width: `${completion * 100}%`, height: '100%', borderRadius: 999, backgroundColor: colors.accent }} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {completionItems.map(item => (
                  <View key={item.label} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: item.done ? `${colors.success}1E` : colors.surfaceHover }}>
                    <Text style={[font.bodySemibold, { color: item.done ? colors.success : colors.textMuted, fontSize: 11 }]}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(130).duration(220))} style={{ borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, gap: 12 }}>
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>Profile color</Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {AVATAR_COLORS.map(color => (
              <AnimatedPressable
                key={color}
                onPress={() => setNewColor(color)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: color,
                  borderWidth: newColor === color ? 3 : StyleSheet.hairlineWidth,
                  borderColor: newColor === color ? colors.text : colors.border,
                }}
                scaleValue={0.85}
                haptic="light"
              />
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(180).duration(220))} style={{ borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <UserCircle color={colors.accent} size={20} weight="bold" />
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>Identity</Text>
          </View>

          <View>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: fontSizes.small,
              fontWeight: '500',
              marginBottom: 8,
              marginLeft: 4,
            }}
          >
            Display Name
          </Text>
          <TextInput
            value={newDisplayName}
            onChangeText={setNewDisplayName}
            placeholder="Your display name"
            maxLength={30}
          />
          </View>

          <View>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: fontSizes.small,
              fontWeight: '500',
              marginBottom: 8,
              marginLeft: 4,
            }}
          >
            Username
          </Text>
          <TextInput
            value={newUsername}
            onChangeText={setNewUsername}
            placeholder="username"
            autoCapitalize="none"
            maxLength={20}
          />
          {newUsername.trim().length > 0 && (
            <Text
              style={{
                fontSize: fontSizes.caption,
                marginTop: 4,
                marginLeft: 4,
                color: usernameValid ? '#10B981' : colors.danger,
              }}
            >
              {usernameValid ? 'Username looks good' : 'At least 2 characters required'}
            </Text>
          )}
          </View>

          <View>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: fontSizes.small,
              fontWeight: '500',
              marginBottom: 8,
              marginLeft: 4,
            }}
          >
            Pronouns
          </Text>
          <TextInput
            value={newPronouns}
            onChangeText={setNewPronouns}
            placeholder="e.g. they/them"
            maxLength={32}
            autoCapitalize="none"
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginLeft: 4 }}>
            {PRONOUN_PRESETS.filter(p => p).map((p) => {
              const active = newPronouns === p;
              return (
                <AnimatedPressable
                  key={p}
                  onPress={() => setNewPronouns(active ? '' : p)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 99,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: active ? colors.accent : colors.border,
                    backgroundColor: active ? `${colors.accent}22` : colors.surfaceHover,
                  }}
                  scaleValue={0.94}
                  haptic="light"
                >
                  <Text style={{ color: active ? colors.accent : colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600' }}>{p}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
          </View>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(240).duration(220))} style={{ borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextAlignLeft color={colors.accent} size={20} weight="bold" />
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>Story</Text>
          </View>

          <View>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: fontSizes.small,
              fontWeight: '500',
              marginBottom: 8,
              marginLeft: 4,
            }}
          >
            Bio
          </Text>
          <TextInput
            value={newBio}
            onChangeText={setNewBio}
            placeholder="Tell people about yourself..."
            maxLength={BIO_MAX}
            multiline
          />
          {/* Bio progress bar */}
          <View style={{ height: 2, backgroundColor: colors.border, borderRadius: 1, marginTop: 8, marginHorizontal: 4 }}>
            <View
              style={{
                height: 2,
                borderRadius: 1,
                width: `${Math.min(bioProgress * 100, 100)}%`,
                backgroundColor: bioNearLimit ? colors.danger : colors.accent,
              }}
            />
          </View>
          <Text
            style={{
              color: bioNearLimit ? colors.danger : colors.textMuted,
              fontSize: fontSizes.caption,
              marginTop: 4,
              marginLeft: 4,
            }}
          >
            {newBio.length}/{BIO_MAX}
          </Text>
          </View>

          <View>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: fontSizes.small,
              fontWeight: '500',
              marginBottom: 4,
              marginLeft: 4,
            }}
          >
            Mood · 24h status
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSizes.caption,
              marginBottom: 8,
              marginLeft: 4,
            }}
          >
            {"What's on your mind right now? Shows above your name for a day, then disappears."}
          </Text>
          <TextInput
            value={newMood}
            onChangeText={(v) => setNewMood(v.slice(0, MOOD_MAX))}
            placeholder="deep-reading mode"
            maxLength={MOOD_MAX}
          />
          <Text
            style={{
              color: newMood.length > MOOD_MAX * 0.9 ? colors.danger : colors.textMuted,
              fontSize: fontSizes.caption,
              marginTop: 4,
              marginLeft: 4,
            }}
          >
            {newMood.length}/{MOOD_MAX}
          </Text>
          </View>
        </Animated.View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
