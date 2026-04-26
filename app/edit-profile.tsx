import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Check } from 'phosphor-react-native';
import { TextInput } from '../components/ui/TextInput';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../components/ui/ProfileAvatar';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { updateRemoteProfile } from '../lib/supabaseEchoApi';

const AVATAR_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#14B8A6', '#F97316', '#6366F1',
];

const BIO_MAX = 160;
const BIO_WARN = 140;

export default function EditProfileScreen() {
  const router = useRouter();
  const { username, displayName, bio, avatarColor, setUsername, setDisplayName, setBio, setAvatarColor } = useAppStore();
  const { colors, radius, fontSizes, animation } = useTheme();

  const [newUsername, setNewUsername] = useState(username);
  const [newDisplayName, setNewDisplayName] = useState(displayName || username);
  const [newBio, setNewBio] = useState(bio);
  const [newColor, setNewColor] = useState(avatarColor);
  const [saving, setSaving] = useState(false);

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
        await updateRemoteProfile({
          username: newUsername.trim().toLowerCase(),
          display_name: newDisplayName.trim() || newUsername.trim(),
          bio: newBio.trim(),
          avatar_color: newColor,
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
          <View style={{ marginBottom: 16 }}>
            <ProfileAvatar
              displayName={newDisplayName || newUsername || '?'}
              avatarColor={newColor}
              size={84}
              showGlow
            />
          </View>
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
      </ScrollView>
    </SafeAreaView>
  );
}
