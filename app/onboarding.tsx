import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChatTeardropDots, Compass, NotePencil, Sparkle, Star, TrendUp } from 'phosphor-react-native';
import { TextInput } from '../components/ui/TextInput';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { supabase } from '../lib/supabase';
import { upsertRemoteProfileOnSignIn } from '../lib/supabaseEchoApi';
import { ONBOARDING_INTERESTS, POSTING_INTENTS } from '../lib/echoUX';

const STORY_STEPS = [
  {
    icon: ChatTeardropDots,
    title: 'Ask Echo something real',
    body: 'Start with a question, idea, or problem worth sharing with other curious people.',
  },
  {
    icon: Sparkle,
    title: 'Refine what matters',
    body: 'Trim the response, add context, and keep only the part that feels worth publishing.',
  },
  {
    icon: TrendUp,
    title: 'Turn it into a public Echo',
    body: 'Post the strongest takeaway so people can react, discuss, and follow your thinking.',
  },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const {
    setUsername,
    setDisplayName,
    setUserId,
    setHasSeenOnboarding,
    interests,
    setInterests,
  } = useAppStore();
  const { colors, radius, fontSizes } = useTheme();
  const [name, setName] = useState('');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selectedIntent, setSelectedIntent] = useState<'chat' | 'discover' | 'post'>('chat');

  const canContinue = useMemo(() => {
    if (step === 1) return name.trim().length >= 2;
    return true;
  }, [name, step]);

  const finishOnboarding = async () => {
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

    // Always land new users on Discover so they see content first.
    // Honor "post" intent only if explicit, otherwise default to discover.
    if (selectedIntent === 'post') {
      router.replace('/create-post');
      return;
    }
    router.replace('/(tabs)/discover');
  };

  const handleContinue = async () => {
    if (step < 2) {
      setStep(prev => prev + 1);
      return;
    }
    await finishOnboarding();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 12 }}>
        {step === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 28 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: radius.xl,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 18,
                  backgroundColor: colors.accent,
                }}
              >
                <ChatTeardropDots color="#fff" size={38} weight="fill" />
              </View>
              <Text style={{ color: colors.text, fontSize: 40, fontWeight: '800' }}>Echo</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 17, marginTop: 10, textAlign: 'center', lineHeight: 24 }}>
                Turn good AI conversations into posts people actually want to read.
              </Text>
            </View>

            <View style={{ gap: 12 }}>
              {STORY_STEPS.map(item => (
                <View
                  key={item.title}
                  style={{
                    padding: 16,
                    borderRadius: radius.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    flexDirection: 'row',
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: radius.lg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.surfaceHover,
                    }}
                  >
                    <item.icon color={colors.accent} size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{item.title}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 4, lineHeight: 20 }}>{item.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800', marginBottom: 10 }}>Set up your profile</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 26, lineHeight: 22 }}>
              Choose a name, then pick a few interests so Discover and suggestions start strong.
            </Text>
            <TextInput
              placeholder="Username"
              value={name}
              onChangeText={setName}
              autoCapitalize="none"
              maxLength={20}
              autoFocus
            />
            {name.trim().length > 0 && name.trim().length < 2 ? (
              <Text style={{ color: colors.danger, fontSize: 14, marginTop: 8, marginLeft: 4 }}>At least 2 characters</Text>
            ) : null}

            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 24, marginBottom: 12 }}>
              What do you want to see more of?
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {ONBOARDING_INTERESTS.map(interest => {
                const selected = interests.includes(interest);
                return (
                  <Pressable
                    key={interest}
                    onPress={() => {
                      if (selected) {
                        setInterests(interests.filter(item => item !== interest));
                        return;
                      }
                      setInterests([...interests, interest].slice(0, 5));
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: radius.full,
                      backgroundColor: selected ? colors.accentMuted : colors.surface,
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : colors.border,
                    }}
                  >
                    <Text style={{ color: selected ? colors.accent : colors.text, fontSize: 14, fontWeight: '600' }}>
                      {interest}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800', marginBottom: 10 }}>Choose your first move</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 22, marginBottom: 22 }}>
              We’ll drop you into the path most likely to get you to a good first Echo.
            </Text>

            <View style={{ gap: 12 }}>
              {POSTING_INTENTS.map(option => {
                const selected = selectedIntent === option.key;
                const Icon = option.key === 'chat' ? ChatTeardropDots : option.key === 'discover' ? Compass : NotePencil;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setSelectedIntent(option.key)}
                    style={{
                      padding: 16,
                      borderRadius: radius.card,
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: selected ? colors.accentMuted : colors.surface,
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 14,
                    }}
                  >
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: radius.lg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? colors.accent : colors.surfaceHover,
                      }}
                    >
                      <Icon color={selected ? '#fff' : colors.accent} size={20} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{option.title}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 4, lineHeight: 20 }}>{option.subtitle}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={{
                marginTop: 24,
                padding: 16,
                borderRadius: radius.card,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <Star color={colors.accent} size={18} weight="fill" />
                <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }}>What makes a strong Echo</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                Keep one strong takeaway, add a little framing, and publish the part you’d want someone else to quote back to you.
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 18 }}>
        <Pressable
          onPress={() => { void handleContinue(); }}
          disabled={busy || !canContinue}
          style={{
            paddingVertical: 16,
            alignItems: 'center',
            borderRadius: radius.card,
            backgroundColor: busy || !canContinue ? colors.surfaceHover : colors.accent,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
              {step < 2 ? 'Continue' : 'Enter Echo'}
            </Text>
          )}
        </Pressable>
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 10, fontSize: 12 }}>
          {step === 0 ? 'You’ll be able to change this later.' : step === 1 ? 'Pick up to 5 interests.' : 'Your recommendation can be changed at any time.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}
