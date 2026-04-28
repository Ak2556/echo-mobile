import React, { useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { User, At } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

const AVATAR_COLORS = [
  '#6366F1', '#EC4899', '#10B981', '#F59E0B', '#3B82F6',
  '#8B5CF6', '#EF4444', '#06B6D4', '#84CC16', '#F97316',
];

export default function SetupProfileScreen() {
  const router = useRouter();
  const setUsername         = useAppStore(s => s.setUsername);
  const setDisplayName      = useAppStore(s => s.setDisplayName);
  const setUserId           = useAppStore(s => s.setUserId);
  const setAvatarColor      = useAppStore(s => s.setAvatarColor);
  const setHasSeenOnboarding = useAppStore(s => s.setHasSeenOnboarding);
  const [displayName, setDisplayNameLocal] = useState('');
  const [username, setUsernameLocal] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const usernameClean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const canSubmit = displayName.trim().length >= 1 && usernameClean.length >= 2 && !loading;

  const handleSave = async () => {
    if (!canSubmit) return;
    setLoading(true);

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      showToast('Session expired. Please sign in again.', '❌');
      setLoading(false);
      router.replace('/auth/login');
      return;
    }

    const userId = session.user.id;

    // Upsert profile in Supabase
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      username: usernameClean,
      display_name: displayName.trim(),
      avatar_color: selectedColor,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      if (error.code === '23505') {
        showToast('Username taken. Try another.', '❌');
      } else {
        showToast(error.message, '❌');
      }
      setLoading(false);
      return;
    }

    // Sync to local store
    setUserId(userId);
    setUsername(usernameClean);
    setDisplayName(displayName.trim());
    setAvatarColor(selectedColor);
    setHasSeenOnboarding(true);

    setLoading(false);
    router.replace('/(tabs)/discover');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.delay(60).springify()} style={{ alignItems: 'center', marginBottom: 40 }}>
            {/* Avatar preview */}
            <View style={{
              width: 88, height: 88, borderRadius: 44, backgroundColor: selectedColor,
              alignItems: 'center', justifyContent: 'center', marginBottom: 20,
              shadowColor: selectedColor, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
            }}>
              <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800' }}>
                {displayName.trim().charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 }}>Set up your profile</Text>
            <Text style={{ color: '#71717A', fontSize: 15, marginTop: 6, textAlign: 'center' }}>
              Let others know who you are
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).springify()}>
            {/* Display Name */}
            <View style={{ marginBottom: 14 }}>
              <Text style={{ color: '#A1A1AA', fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>DISPLAY NAME</Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A',
                paddingHorizontal: 14, paddingVertical: 4,
              }}>
                <User color="#52525B" size={18} style={{ marginRight: 10 }} />
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayNameLocal}
                  placeholder="Your name"
                  placeholderTextColor="#52525B"
                  maxLength={40}
                  style={{ flex: 1, color: '#fff', fontSize: 16, paddingVertical: 14 }}
                />
              </View>
            </View>

            {/* Username */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ color: '#A1A1AA', fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>USERNAME</Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A',
                paddingHorizontal: 14, paddingVertical: 4,
              }}>
                <At color="#52525B" size={18} style={{ marginRight: 6 }} />
                <TextInput
                  value={username}
                  onChangeText={setUsernameLocal}
                  placeholder="yourhandle"
                  placeholderTextColor="#52525B"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  style={{ flex: 1, color: '#fff', fontSize: 16, paddingVertical: 14 }}
                />
                {usernameClean.length > 0 && (
                  <Text style={{ color: '#52525B', fontSize: 13 }}>@{usernameClean}</Text>
                )}
              </View>
              <Text style={{ color: '#52525B', fontSize: 12, marginTop: 6, marginLeft: 2 }}>
                Only letters, numbers, and underscores. Min. 2 characters.
              </Text>
            </View>

            {/* Avatar color picker */}
            <View style={{ marginBottom: 32 }}>
              <Text style={{ color: '#A1A1AA', fontSize: 13, fontWeight: '600', marginBottom: 12, marginLeft: 2 }}>AVATAR COLOR</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {AVATAR_COLORS.map(color => (
                  <AnimatedPressable
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    scaleValue={0.88}
                    haptic="light"
                    style={{
                      width: 40, height: 40, borderRadius: 20, backgroundColor: color,
                      borderWidth: selectedColor === color ? 3 : 0,
                      borderColor: '#fff',
                    }}
                  />
                ))}
              </View>
            </View>

            {/* Save button */}
            <AnimatedPressable
              onPress={handleSave}
              disabled={!canSubmit}
              scaleValue={0.97}
              haptic="medium"
              style={{
                backgroundColor: canSubmit ? '#6366F1' : '#27272A',
                borderRadius: 14, paddingVertical: 16,
                alignItems: 'center', justifyContent: 'center',
                opacity: canSubmit ? 1 : 0.6,
                shadowColor: '#6366F1', shadowOpacity: canSubmit ? 0.4 : 0,
                shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                marginBottom: 32,
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Let's go →</Text>}
            </AnimatedPressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
