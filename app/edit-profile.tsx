import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Check, Camera } from 'phosphor-react-native';
import { TextInput } from '../components/ui/TextInput';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../components/ui/ProfileAvatar';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { fetchRemoteProfile, updateRemoteProfile, uploadAvatar } from '../lib/supabaseEchoApi';
import { supabase } from '../lib/supabase';

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
  const { username, displayName, bio, avatarColor, avatarUrl, setUsername, setDisplayName, setBio, setAvatarColor, setAvatarUrl } = useAppStore();
  const { colors, radius, fontSizes, animation } = useTheme();

  const [newUsername, setNewUsername] = useState(username);
  const [newDisplayName, setNewDisplayName] = useState(displayName || username);
  const [newBio, setNewBio] = useState(bio);
  const [newColor, setNewColor] = useState(avatarColor);
  const [newAvatarUrl, setNewAvatarUrl] = useState(avatarUrl || '');
  const [newPronouns, setNewPronouns] = useState('');
  const [newMood, setNewMood] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate pronouns + mood from the remote profile on mount.
  // We keep these out of the local Zustand store for now — they're
  // small fields and only relevant in this screen + the AI's system
  // prompt (read on the server side).
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
          ...(newAvatarUrl ? { avatar_url: newAvatarUrl } : {}),
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
    showToast('Profile updated!', '\u{2728}');
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
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Edit Profile</Text>
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

      <ScrollView className="flex-1 px-4 pt-6" showsVerticalScrollIndicator={false}>
        {/* Avatar preview with glow ring */}
        <Animated.View entering={animation(FadeInDown.delay(100).springify())} className="items-center mb-8">
          <AnimatedPressable
            onPress={() => { void handlePickAvatar(); }}
            disabled={uploadingAvatar}
            style={{ marginBottom: 16, position: 'relative' }}
            scaleValue={0.95}
            haptic="light"
          >
            <ProfileAvatar
              displayName={newDisplayName || newUsername || '?'}
              avatarColor={newColor}
              avatarUrl={newAvatarUrl || undefined}
              size={84}
              showGlow
            />
            {/* "Change Photo" badge */}
            <View style={{
              position: 'absolute', bottom: 2, right: 2,
              backgroundColor: colors.accent, borderRadius: 14, padding: 5,
              borderWidth: 2, borderColor: colors.bg,
            }}>
              {uploadingAvatar
                ? <ActivityIndicator size="small" color="#fff" style={{ width: 14, height: 14 }} />
                : <Camera size={14} color="#fff" weight="fill" />
              }
            </View>
          </AnimatedPressable>
          <View className="flex-row gap-2.5 flex-wrap justify-center">
            {AVATAR_COLORS.map(color => (
              <AnimatedPressable
                key={color}
                onPress={() => setNewColor(color)}
                className="w-9 h-9 rounded-full"
                style={{
                  backgroundColor: color,
                  borderWidth: newColor === color ? 2 : 0,
                  borderColor: colors.text,
                }}
                scaleValue={0.85}
                haptic="light"
              />
            ))}
          </View>
        </Animated.View>

        {/* Display Name */}
        <Animated.View entering={animation(FadeInDown.delay(200).springify())} className="mb-4">
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
        </Animated.View>

        {/* Username */}
        <Animated.View entering={animation(FadeInDown.delay(250).springify())} className="mb-4">
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
        </Animated.View>

        {/* Bio */}
        <Animated.View entering={animation(FadeInDown.delay(300).springify())} className="mb-4">
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
        </Animated.View>

        {/* Pronouns — small text field with quick presets */}
        <Animated.View entering={animation(FadeInDown.delay(350).springify())} className="mb-4">
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
          {/* Quick-pick presets */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginLeft: 4 }}>
            {PRONOUN_PRESETS.filter(p => p).map((p) => {
              const active = newPronouns === p;
              return (
                <AnimatedPressable
                  key={p}
                  onPress={() => setNewPronouns(active ? '' : p)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 99,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.border,
                    backgroundColor: active ? colors.accent + '22' : 'transparent',
                  }}
                  scaleValue={0.94}
                  haptic="light"
                >
                  <Text style={{ color: active ? colors.accent : colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600' }}>{p}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Mood — 60-char status that auto-expires in 24h */}
        <Animated.View entering={animation(FadeInDown.delay(400).springify())} className="mb-8">
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
            What's on your mind right now? Shows above your name for a day, then disappears.
          </Text>
          <TextInput
            value={newMood}
            onChangeText={(v) => setNewMood(v.slice(0, MOOD_MAX))}
            placeholder="📚 deep-reading mode"
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
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
