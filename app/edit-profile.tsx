import React, { useEffect, useState } from 'react';
import { useVoiceScreenActions } from '../lib/voice/useVoiceScreenActions';
import { View, Text, ScrollView, Alert, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Camera, TextAlignLeft, UserCircle } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { TextInput } from '../components/ui/TextInput';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../components/ui/ProfileAvatar';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { WARM_AVATAR_COLORS } from '../lib/social/avatarPalette';
import { useTheme } from '../lib/ui/theme';
import { isSupabaseRemote } from '../lib/core/remoteConfig';
import { fetchRemoteProfile, isUsernameTaken, updateRemoteProfile, uploadAvatar } from '../lib/supabaseEchoApi';
import { cleanUsername, isAutoUsername, isValidUsername, USERNAME_MAX, USERNAME_MIN } from '../lib/social/username';
import { supabase } from '../lib/supabase';
import { useResponsiveLayout } from '../lib/ui/responsive';
import { ttx } from '../lib/i18n/i18n';
import { PhotoEditor } from '../components/feed/PhotoEditor';
import { ON_MEDIA } from '../lib/ui/fixedColors';

// The picker offers the canonical warm identity palette. It previously held
// raw Tailwind hues, which meant a freshly-edited profile could set a colour
// the rest of the app immediately remapped (see lib/social/avatarPalette.ts).
const AVATAR_COLORS = WARM_AVATAR_COLORS;

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

  // Voice dictation appends here, so your bio can be spoken in pieces. It
  // fills the field and never submits: the user reads back what was heard
  // before it goes anywhere.
  useVoiceScreenActions({
    composeText: (spoken) => {
      setNewBio((prev) => (prev ? `${prev} ${spoken}` : spoken));
      return true;
    },
  });
  const [newColor, setNewColor] = useState(avatarColor);
  const [newAvatarUrl, setNewAvatarUrl] = useState(avatarUrl || '');
  const [editingUri, setEditingUri] = useState<string | null>(null);
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

  /**
   * The badge on the avatar is a camera, and it opened the photo library.
   * Reported as "camera does not open" — it never was opened, because nothing
   * called it. Now the icon offers what it depicts, with the library still one
   * tap away, and both paths land in the same editor.
   */
  const handleAvatarBadge = () => {
    Alert.alert(
      ttx('Profile photo'),
      undefined,
      [
        { text: ttx('Take photo'), onPress: () => { void takeAvatarPhoto(); } },
        { text: ttx('Choose from library'), onPress: () => { void handlePickAvatar(); } },
        { text: ttx('Cancel'), style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const takeAvatarPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        ttx('Camera unavailable'),
        ttx('Echo needs camera access to take a profile photo. You can turn it on in Settings.'),
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.72,
    });
    if (result.canceled) return;
    setEditingUri(result.assets[0].uri);
  };

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // allowsEditing/aspect handed the crop to the OS, which is a different
      // editor from the one every other upload in Echo uses. The picked image
      // now goes through PhotoEditor instead, same as create-post.
      quality: 0.72,
      base64: true,
    });
    if (result.canceled) return;
    setEditingUri(result.assets[0].uri);
  };

  /** Called by PhotoEditor once the crop and any edits are applied. */
  const handleAvatarEdited = async (editedUri: string) => {
    setEditingUri(null);
    // PhotoEditor writes a JPEG to a local file and hands back its uri. There
    // is no base64 to reuse — uploadAvatar reads the file when base64 is absent.
    const asset = {
      uri: editedUri,
      base64: undefined as string | undefined,
      mimeType: 'image/jpeg',
      fileName: `avatar-${Date.now()}.jpg`,
    };
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

  // Only a changed handle is held to the rules. A few accounts chose dotted
  // handles before the rules existed, and saving a bio shouldn't force them
  // to rename.
  const usernameChanged = newUsername !== username;
  const usernameValid = !usernameChanged || isValidUsername(newUsername);
  const bioProgress = newBio.length / BIO_MAX;
  const bioNearLimit = newBio.length > BIO_WARN;
  const completionItems = [
    { label: 'Name', done: !!newDisplayName.trim() },
    { label: 'Username', done: usernameValid && !isAutoUsername(newUsername) },
    { label: 'Bio', done: !!newBio.trim() },
    { label: 'Photo', done: !!newAvatarUrl && profilePhotoVisible },
  ];
  const completion = completionItems.filter(item => item.done).length / completionItems.length;

  const handleSave = async () => {
    if (!usernameValid) {
      Alert.alert(ttx('Choose a different username'), `${USERNAME_MIN}–${USERNAME_MAX} ${ttx('letters, numbers or underscores')}`);
      return;
    }
    if (isSupabaseRemote()) {
      setSaving(true);
      try {
        if (usernameChanged && await isUsernameTaken(newUsername)) {
          Alert.alert(ttx('Choose a different username'), `@${newUsername} ${ttx('is taken')}`);
          setSaving(false);
          return;
        }
        const trimmedMood = newMood.trim().slice(0, MOOD_MAX);
        await updateRemoteProfile({
          username: newUsername,
          display_name: newDisplayName.trim() || newUsername,
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
        // Someone took the handle between the check and the save.
        const taken = (e as { code?: string }).code === '23505';
        Alert.alert(ttx('Could not save'), taken ? `@${newUsername} ${ttx('is taken')}` : (e as Error).message);
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setUsername(newUsername);
    setDisplayName(newDisplayName.trim() || newUsername);
    setBio(newBio.trim());
    setAvatarColor(newColor);
    if (newAvatarUrl) setAvatarUrl(newAvatarUrl);
    showToast('Profile updated!', 'Saved');
    router.back();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={ttx("Edit Profile")}
        right={
          <AnimatedPressable
            onPress={() => { void handleSave(); }}
            disabled={saving}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 14, paddingVertical: 7, marginRight: 6,
              borderRadius: radius.lg,
              backgroundColor: saving ? colors.surfaceHover : colors.accent,
            }}
            scaleValue={0.93}
            haptic="medium"
          >
            {saving ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Check color={colors.onAccent} size={16} />
            )}
            <Text style={{ color: colors.onAccent, fontWeight: '600', fontSize: fontSizes.small }}>{ttx("Save")}</Text>
          </AnimatedPressable>
        }
      />

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
                onPress={handleAvatarBadge}
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
                    ? <ActivityIndicator size="small" color={ON_MEDIA} style={{ width: 14, height: 14 }} />
                    : <Camera size={14} color={ON_MEDIA} weight="fill" />
                  }
                </View>
              </AnimatedPressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[font.display, { color: colors.text, fontSize: 30, lineHeight: 35 }]} numberOfLines={1}>
                  {newDisplayName || newUsername || 'Your profile'}
                </Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 13, marginTop: 4 }]} numberOfLines={1}>
                  @{newUsername || 'username'}
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
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>{ttx("Profile color")}</Text>
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
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>{ttx("Identity")}</Text>
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
            {ttx("Display Name")}
          </Text>
          <TextInput
            value={newDisplayName}
            onChangeText={setNewDisplayName}
            placeholder={ttx("Your display name")}
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
            {ttx("Username")}
          </Text>
          <TextInput
            value={newUsername}
            onChangeText={v => setNewUsername(cleanUsername(v))}
            placeholder={ttx("username")}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={USERNAME_MAX}
          />
          {usernameChanged && (
            <Text
              style={{
                fontSize: fontSizes.caption,
                marginTop: 4,
                marginLeft: 4,
                color: usernameValid ? colors.success : colors.danger,
              }}
            >
              {usernameValid ? `@${newUsername}` : `${USERNAME_MIN}–${USERNAME_MAX} ${ttx('letters, numbers or underscores')}`}
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
            {ttx("Pronouns")}
          </Text>
          <TextInput
            value={newPronouns}
            onChangeText={setNewPronouns}
            placeholder={ttx("e.g. they/them")}
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
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>{ttx("Story")}</Text>
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
            {ttx("Bio")}
          </Text>
          <TextInput
            value={newBio}
            onChangeText={setNewBio}
            placeholder={ttx("Tell people about yourself...")}
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
            {ttx("Mood · 24h status")}
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
            placeholder={ttx("deep-reading mode")}
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
      <PhotoEditor
        visible={editingUri !== null}
        uri={editingUri}
        onDone={handleAvatarEdited}
        onCancel={() => setEditingUri(null)}
      />
    </SafeAreaView>
  );
}
