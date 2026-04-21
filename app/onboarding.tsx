import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { ChatTeardropDots, Star, Users } from 'phosphor-react-native';
import { TextInput } from '../components/ui/TextInput';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { supabase } from '../lib/supabase';
import { upsertRemoteProfileOnSignIn } from '../lib/supabaseEchoApi';

const FEATURES = [
  { icon: ChatTeardropDots, title: 'AI Conversations', desc: 'Chat with Echo, your personal AI assistant' },
  { icon: Users, title: 'Social Discovery', desc: 'Share and explore conversations from the community' },
  { icon: Star, title: 'Smart & Fast', desc: 'Powered by streaming AI with real-time responses' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { setUsername, setDisplayName, setUserId, setHasSeenOnboarding } = useAppStore();
  const { colors, radius, animation } = useTheme();
  const [name, setName] = useState('');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const handleContinue = async () => {
    if (step === 0) {
      setStep(1);
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length < 2) return;

    if (isSupabaseRemote()) {
      setBusy(true);
      try {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          session = data.session;
        }
        if (!session?.user?.id) throw new Error('No session');

        await upsertRemoteProfileOnSignIn(trimmed.toLowerCase(), trimmed);
        setUserId(session.user.id);
      } catch (e) {
        Alert.alert('Could not create profile', (e as Error).message);
        setBusy(false);
        return;
      }
      setBusy(false);
    } else {
      setUserId('me');
    }

    setUsername(trimmed);
    setDisplayName(trimmed);
    setHasSeenOnboarding(true);
    router.replace('/(tabs)/discover');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-1 px-6 justify-center">
        {step === 0 ? (
          <>
            <Animated.View entering={animation(FadeInUp.delay(100).springify())}>
              <View className="items-center mb-8">
                <View className="w-20 h-20 items-center justify-center mb-4" style={{ backgroundColor: colors.accent, borderRadius: radius.xl }}>
                  <ChatTeardropDots color="#fff" size={40} weight="fill" />
                </View>
                <Text style={{ color: colors.text, fontSize: 40, fontWeight: '700' }}>Echo</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 18, marginTop: 8, textAlign: 'center', lineHeight: 26 }}>AI conversations,{'\n'}shared with the world.</Text>
              </View>
            </Animated.View>

            {FEATURES.map((f, i) => (
              <Animated.View
                key={f.title}
                entering={animation(FadeInDown.delay(300 + i * 150).springify())}
                className="flex-row items-center p-4 mb-3"
                style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}
              >
                <View className="w-12 h-12 items-center justify-center mr-4" style={{ backgroundColor: colors.surfaceHover, borderRadius: radius.lg }}>
                  <f.icon color={colors.accent} size={24} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{f.title}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>{f.desc}</Text>
                </View>
              </Animated.View>
            ))}
          </>
        ) : (
          <Animated.View entering={animation(FadeInUp.springify())}>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700', marginBottom: 8 }}>What should we call you?</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 32 }}>Pick a username for your Echo profile.</Text>
            <TextInput
              placeholder="Username"
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="none"
              maxLength={20}
            />
            {name.trim().length > 0 && name.trim().length < 2 && (
              <Text style={{ color: colors.danger, fontSize: 14, marginTop: 8, marginLeft: 4 }}>At least 2 characters</Text>
            )}
          </Animated.View>
        )}
      </View>

      <View className="px-6 pb-4">
        <Pressable
          onPress={() => { void handleContinue(); }}
          disabled={busy || (step === 1 && name.trim().length < 2)}
          className="py-4 items-center"
          style={{
            borderRadius: radius.card,
            backgroundColor: busy || (step === 1 && name.trim().length < 2) ? colors.surfaceHover : colors.accent,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
              {step === 0 ? 'Get Started' : 'Continue'}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
