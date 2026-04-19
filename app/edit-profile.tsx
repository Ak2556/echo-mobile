import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { TextInput } from '../components/ui/TextInput';
import { useAppStore } from '../store/useAppStore';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { updateRemoteProfile } from '../lib/supabaseEchoApi';

const AVATAR_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#14B8A6', '#F97316', '#6366F1',
];

export default function EditProfileScreen() {
  const router = useRouter();
  const { username, displayName, bio, avatarColor, setUsername, setDisplayName, setBio, setAvatarColor } = useAppStore();

  const [newUsername, setNewUsername] = useState(username);
  const [newDisplayName, setNewDisplayName] = useState(displayName || username);
  const [newBio, setNewBio] = useState(bio);
  const [newColor, setNewColor] = useState(avatarColor);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (newUsername.trim().length < 2) {
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
    router.back();
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <Text className="text-white font-bold text-lg">Edit Profile</Text>
        <Pressable
          onPress={() => { void handleSave(); }}
          disabled={saving}
          className={`flex-row items-center gap-1.5 px-4 py-2 rounded-xl ${saving ? 'bg-zinc-700' : 'bg-blue-600'}`}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Check color="#fff" size={16} />
          )}
          <Text className="text-white font-semibold text-sm">Save</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 pt-6" showsVerticalScrollIndicator={false}>
        {/* Avatar color picker */}
        <View className="items-center mb-8">
          <View
            className="w-24 h-24 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: newColor }}
          >
            <Text className="text-white text-4xl font-bold">
              {(newDisplayName || newUsername || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-row gap-2.5 flex-wrap justify-center">
            {AVATAR_COLORS.map(color => (
              <Pressable
                key={color}
                onPress={() => setNewColor(color)}
                className={`w-9 h-9 rounded-full ${newColor === color ? 'border-2 border-white' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </View>
        </View>

        {/* Fields */}
        <View className="mb-4">
          <Text className="text-zinc-400 text-sm font-medium mb-2 ml-1">Display Name</Text>
          <TextInput
            value={newDisplayName}
            onChangeText={setNewDisplayName}
            placeholder="Your display name"
            maxLength={30}
          />
        </View>

        <View className="mb-4">
          <Text className="text-zinc-400 text-sm font-medium mb-2 ml-1">Username</Text>
          <TextInput
            value={newUsername}
            onChangeText={setNewUsername}
            placeholder="username"
            autoCapitalize="none"
            maxLength={20}
          />
        </View>

        <View className="mb-4">
          <Text className="text-zinc-400 text-sm font-medium mb-2 ml-1">Bio</Text>
          <TextInput
            value={newBio}
            onChangeText={setNewBio}
            placeholder="Tell people about yourself..."
            maxLength={160}
            multiline
          />
          <Text className="text-zinc-600 text-xs mt-1 ml-1">{newBio.length}/160</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
