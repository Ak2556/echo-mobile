import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { EnvelopeSimple } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';
import { refreshAuthSession, signInAsDemo } from '../../lib/auth';
import { showToast } from '../../components/ui/Toast';

const ROTATING_PROMPTS = [
  'What’s a song that always pulls you out of a bad mood?',
  'What did you outgrow this year?',
  'What’s a sentence you’ve read that you can’t forget?',
  'What’s the most expensive thing you’ve ever changed your mind about?',
  'What’s a small ritual that anchors your week?',
  'What’s an idea you keep returning to?',
];

const DEMO_ENABLED = !!(process.env.EXPO_PUBLIC_DEMO_EMAIL && process.env.EXPO_PUBLIC_DEMO_PASSWORD);

export default function LoginScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();
  const layout = useResponsiveLayout();
  const isDark = colors.isDark;

  const [demoLoading, setDemoLoading] = useState(false);
  const [promptIdx, setPromptIdx] = useState(0);

  const handleDemo = async () => {
    if (demoLoading) return;
    setDemoLoading(true);
    const { error } = await signInAsDemo();
    if (error) {
      setDemoLoading(false);
      showToast('Demo sign-in unavailable', 'Error');
      return;
    }
    const status = await refreshAuthSession();
    setDemoLoading(false);
    if (status === 'ready') router.replace('/(tabs)/home');
    else if (status === 'needs-onboarding') router.replace('/auth/signup-wizard');
  };
  useEffect(() => {
    const t = setInterval(() => setPromptIdx(i => (i + 1) % ROTATING_PROMPTS.length), 4_000);
    return () => clearInterval(t);
  }, []);

  const dotScale = useSharedValue(1);
  useEffect(() => {
    dotScale.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 1100 }),
        withTiming(1, { duration: 1100 }),
      ),
      -1,
      false,
    );
  }, [dotScale]);
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
  }));

  const bgBase = isDark ? '#08080C' : '#FAFAFB';

  return (
    <View style={{ flex: 1, backgroundColor: bgBase }}>
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
        <LinearGradient
          colors={isDark
            ? ['rgba(224,96,48,0.06)', 'transparent', 'rgba(0,0,0,0.0)']
            : ['rgba(224,96,48,0.04)', 'transparent']}
          locations={isDark ? [0, 0.45, 1] : [0, 1]}
          style={{ position: 'absolute', inset: 0 }}
        />
      </View>

      <SafeAreaView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: layout.formMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: layout.isWide ? 0 : 28,
            justifyContent: 'space-between',
            paddingBottom: 24,
          }}
        >

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Animated.View entering={FadeInDown.duration(380).springify().mass(0.7).damping(14)} style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={[font.displayBlack, { color: colors.text, fontSize: 92, lineHeight: 100 }]}>
                echo
              </Text>
              <Animated.View style={[{ marginLeft: 2, marginBottom: 14 }, dotStyle]}>
                <View style={{
                  width: 16, height: 16, borderRadius: 8,
                  backgroundColor: colors.accent,
                  shadowColor: colors.accent,
                  shadowOpacity: 0.9,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 0 },
                }} />
              </Animated.View>
            </Animated.View>

            <View style={{ height: 88, marginTop: 32, justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 4 }}>
              <Animated.Text
                key={promptIdx}
                entering={FadeIn.duration(420)}
                style={[font.quote, {
                  color: colors.textSecondary,
                  fontSize: 18,
                  textAlign: 'center',
                  lineHeight: 26,
                  letterSpacing: 0,
                }]}
              >
                {`“${ROTATING_PROMPTS[promptIdx]}”`}
              </Animated.Text>
              <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: 12, marginTop: 14 }]}>
                A QUESTION WORTH KEEPING
              </Text>
            </View>
          </View>

          <View style={{ gap: 16 }}>
            <Animated.View entering={FadeInDown.delay(120).duration(360).springify().mass(0.7)}>
              <PrimaryButton
                icon={<EnvelopeSimple color="#fff" size={20} weight="bold" />}
                label="Continue with email"
                onPress={() => router.push('/auth/email')}
                bg={colors.accent}
                fg="#fff"
                radius={radius.lg}
                font={font.bodyBold}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(360)} style={{ alignItems: 'center' }}>
              <Pressable
                onPress={() => router.push('/auth/phone')}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Continue with phone"
                style={{ paddingVertical: 10, paddingHorizontal: 16 }}
              >
                <Text style={[font.bodyMedium, { color: colors.textSecondary, fontSize: 14 }]}>
                  or sign in with{'  '}
                  <Text style={[font.bodyBold, { color: colors.text }]}>phone</Text>
                </Text>
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(260).duration(360)} style={{ alignItems: 'center', marginTop: 8 }}>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 16, letterSpacing: 0.1 }]}>
                By continuing you agree to our{' '}
                <Text style={[font.bodySemibold, { color: colors.textSecondary }]}>Terms</Text>
                {' & '}
                <Text style={[font.bodySemibold, { color: colors.textSecondary }]}>Privacy.</Text>
              </Text>
            </Animated.View>

            {DEMO_ENABLED && (
              <Animated.View entering={FadeInDown.delay(320).duration(360)} style={{ alignItems: 'center' }}>
                <Pressable
                  onPress={handleDemo}
                  disabled={demoLoading}
                  hitSlop={12}
                  style={{ paddingVertical: 8, paddingHorizontal: 16, opacity: demoLoading ? 0.5 : 1 }}
                >
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 12 }]}>
                    App Review · <Text style={{ color: colors.textSecondary }}>Open demo account</Text>
                  </Text>
                </Pressable>
              </Animated.View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function PrimaryButton({
  icon, label, onPress, bg, fg, radius, font,
}: {
  icon: React.ReactNode; label: string; onPress: () => void;
  bg: string; fg: string; radius: number; font: object;
}) {
  return (
    <View style={{
      backgroundColor: bg,
      borderRadius: radius,
      shadowColor: bg,
      shadowOpacity: 0.55,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
        style={{
          paddingVertical: 19,
          paddingHorizontal: 20,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 10,
        }}
      >
        {icon}
        <Text style={[font, { color: fg, fontSize: 16, letterSpacing: 0 }]}>{label}</Text>
      </Pressable>
    </View>
  );
}
