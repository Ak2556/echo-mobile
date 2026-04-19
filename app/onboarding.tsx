import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { MessageSquare, Sparkles, Users } from 'lucide-react-native';
import { TextInput } from '../components/ui/TextInput';
import { useAppStore } from '../store/useAppStore';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { supabase } from '../lib/supabase';
import { upsertRemoteProfileOnSignIn } from '../lib/supabaseEchoApi';

const FEATURES = [
  { icon: MessageSquare, title: 'AI Conversations', desc: 'Chat with Echo, your personal AI assistant' },
  { icon: Users, title: 'Social Discovery', desc: 'Share and explore conversations from the community' },
  { icon: Sparkles, title: 'Smart & Fast', desc: 'Powered by streaming AI with real-time responses' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { setUsername, setDisplayName, setUserId, setHasSeenOnboarding } = useAppStore();
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
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 px-6 justify-center">
        {step === 0 ? (
          <>
            <Animated.View entering={FadeInUp.delay(100).springify()}>
              <View className="items-center mb-8">
                <View className="w-20 h-20 rounded-3xl bg-blue-600 items-center justify-center mb-4">
                  <MessageSquare color="#fff" size={40} />
                </View>
                <Text className="text-white text-4xl font-bold">Echo</Text>
                <Text className="text-zinc-400 text-lg mt-2 text-center">AI conversations,{'\n'}shared with the world.</Text>
              </View>
            </Animated.View>

            {FEATURES.map((f, i) => (
              <Animated.View
                key={f.title}
                entering={FadeInDown.delay(300 + i * 150).springify()}
                className="flex-row items-center bg-zinc-900 rounded-2xl p-4 mb-3 border border-zinc-800"
              >
                <View className="w-12 h-12 rounded-xl bg-zinc-800 items-center justify-center mr-4">
                  <f.icon color="#3B82F6" size={24} />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-semibold text-base">{f.title}</Text>
                  <Text className="text-zinc-400 text-sm mt-0.5">{f.desc}</Text>
                </View>
              </Animated.View>
            ))}
          </>
        ) : (
          <Animated.View entering={FadeInUp.springify()}>
            <Text className="text-white text-3xl font-bold mb-2">What should we call you?</Text>
            <Text className="text-zinc-400 text-base mb-8">Pick a username for your Echo profile.</Text>
            <TextInput
              placeholder="Username"
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="none"
              maxLength={20}
            />
            {name.trim().length > 0 && name.trim().length < 2 && (
              <Text className="text-red-400 text-sm mt-2 ml-1">At least 2 characters</Text>
            )}
          </Animated.View>
        )}
      </View>

      <View className="px-6 pb-4">
        <Pressable
          onPress={() => { void handleContinue(); }}
          disabled={busy || (step === 1 && name.trim().length < 2)}
          className={`py-4 rounded-2xl items-center ${
            busy || (step === 1 && name.trim().length < 2) ? 'bg-zinc-800' : 'bg-blue-600'
          }`}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-lg">
              {step === 0 ? 'Get Started' : 'Continue'}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
