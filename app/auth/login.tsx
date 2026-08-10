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
import { EnvelopeSimple, GoogleLogo } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';
import * as Haptics from 'expo-haptics';
import { CANCELLED, refreshAuthSession, signInAsDemo, signInWithGoogle } from '../../lib/auth';
import { showToast } from '../../components/ui/Toast';
import { useI18n, type TranslationKey } from '../../lib/i18n';

const ROTATING_PROMPT_KEYS: TranslationKey[] = [
  'auth.prompt.song',
  'auth.prompt.outgrow',
  'auth.prompt.sentence',
  'auth.prompt.changedMind',
  'auth.prompt.ritual',
  'auth.prompt.idea',
];

const DEMO_ENABLED = !!(process.env.EXPO_PUBLIC_DEMO_EMAIL && process.env.EXPO_PUBLIC_DEMO_PASSWORD);

export default function LoginScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();
  const layout = useResponsiveLayout();
  const { t, textDirection } = useI18n();
  const isDark = colors.isDark;

  const [demoLoading, setDemoLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [promptIdx, setPromptIdx] = useState(0);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');

  const handleGoogle = async () => {
    if (googleLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setGoogleLoading(false);
      if (error !== CANCELLED) showToast(error, t('auth.error'));
      return;
    }
    const status = await refreshAuthSession();
    setGoogleLoading(false);
    if (status === 'ready') router.replace('/(tabs)/home');
    else if (status === 'needs-onboarding') router.replace('/auth/signup-wizard');
  };

  const handleDemo = async () => {
    if (demoLoading) return;
    setDemoLoading(true);
    const { error } = await signInAsDemo();
    if (error) {
      setDemoLoading(false);
      showToast(t('auth.demoUnavailable'), t('auth.error'));
      return;
    }
    const status = await refreshAuthSession();
    setDemoLoading(false);
    if (status === 'ready') router.replace('/(tabs)/home');
    else if (status === 'needs-onboarding') router.replace('/auth/signup-wizard');
  };

  useEffect(() => {
    const timer = setInterval(() => setPromptIdx(i => (i + 1) % ROTATING_PROMPT_KEYS.length), 4_000);
    return () => clearInterval(timer);
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
            <Animated.View entering={FadeInDown.duration(400).springify().mass(0.6).damping(16)} style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={[font.displayBlack, { color: colors.text, fontSize: 104, lineHeight: 110, letterSpacing: -2 }]}>
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
                entering={FadeIn.duration(600)}
                style={[font.quote, {
                  color: colors.textSecondary,
                  fontSize: 19,
                  textAlign: 'center',
                  writingDirection: textDirection.writingDirection,
                  lineHeight: 28,
                  letterSpacing: 0.2,
                }]}
              >
                {`"${t(ROTATING_PROMPT_KEYS[promptIdx])}"`}
              </Animated.Text>
              <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 11, marginTop: 14, letterSpacing: 1.6 }]}>
                {t('auth.loginQuestionLabel').toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={{ gap: 14 }}>
            <Animated.View entering={FadeInDown.delay(100).duration(400).springify().mass(0.7)}>
              <PrimaryButton
                icon={googleLoading
                  ? null
                  : <GoogleLogo color={isDark ? '#0C0B09' : '#fff'} size={22} weight="fill" />}
                label={googleLoading ? t('auth.signingIn') : (authMode === 'signup' ? 'Sign up with Google' : 'Log in with Google')}
                onPress={handleGoogle}
                bg={isDark ? '#FFFFFF' : '#0C0B09'}
                fg={isDark ? '#0C0B09' : '#fff'}
                radius={radius.full}
                font={font.bodyBold}
                glow={true}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(160).duration(400).springify().mass(0.7)}>
              <PrimaryButton
                icon={<EnvelopeSimple color="#fff" size={22} weight="fill" />}
                label={authMode === 'signup' ? 'Sign up with Email' : 'Log in with Email'}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (authMode === 'signup') {
                    router.push('/auth/signup-wizard');
                  } else {
                    router.push(`/auth/email?mode=${authMode}`);
                  }
                }}
                bg={colors.accent}
                fg="#fff"
                radius={radius.full}
                font={font.bodyBold}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(220).duration(400)} style={{ alignItems: 'center', marginTop: 12 }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAuthMode(authMode === 'signup' ? 'login' : 'signup');
                }}
                hitSlop={12}
                accessibilityRole="button"
                style={{ paddingVertical: 10, paddingHorizontal: 16 }}
              >
                <Text style={[font.bodyMedium, { color: colors.textSecondary, fontSize: 15 }]}>
                  {authMode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
                  <Text style={[font.bodyBold, { color: colors.text }]}>
                    {authMode === 'signup' ? 'Log in' : 'Sign up'}
                  </Text>
                </Text>
              </Pressable>
            </Animated.View>



            <Animated.View entering={FadeInDown.delay(260).duration(400)} style={{ alignItems: 'center', marginTop: 8 }}>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 16, letterSpacing: 0.1 }]}>
                {t('auth.termsPrefix')}{' '}
                <Text
                  style={[font.bodySemibold, { color: colors.textSecondary, textDecorationLine: 'underline' }]}
                  onPress={() => router.push('/terms')}
                  accessibilityRole="link"
                >
                  {t('auth.terms')}
                </Text>
                {' & '}
                <Text
                  style={[font.bodySemibold, { color: colors.textSecondary, textDecorationLine: 'underline' }]}
                  onPress={() => router.push('/privacy')}
                  accessibilityRole="link"
                >
                  {t('auth.privacy')}
                </Text>
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
                    {t('auth.appReview')} · <Text style={{ color: colors.textSecondary }}>{t('auth.openDemo')}</Text>
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
  icon, label, onPress, bg, fg, radius, font, glow = true,
}: {
  icon: React.ReactNode; label: string; onPress: () => void;
  bg: string; fg: string; radius: number; font: object; glow?: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[
      animatedStyle,
      {
        backgroundColor: bg,
        borderRadius: radius,
        shadowColor: bg,
        shadowOpacity: glow ? 0.35 : 0.1,
        shadowRadius: glow ? 20 : 6,
        shadowOffset: { width: 0, height: glow ? 10 : 2 },
        borderWidth: 1,
        borderColor: glow ? 'rgba(255,255,255,0.1)' : 'transparent',
      }
    ]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(0.96, { duration: 100 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 150 });
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          paddingVertical: 18,
          paddingHorizontal: 20,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 12,
        }}
      >
        {icon}
        <Text style={[font, { color: fg, fontSize: 17, letterSpacing: -0.2 }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}
