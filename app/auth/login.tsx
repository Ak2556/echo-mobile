import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
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
  withSpring,
} from 'react-native-reanimated';
import { EnvelopeSimple } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * Login — v1 entry point, redesigned for first-impression weight.
 *
 * Visual ideas:
 *   1. Atmospheric mesh background — three blurred orbs of indigo, violet,
 *      and deep cyan drift very slowly behind everything.
 *   2. The wordmark IS the hero — 96pt typography with a slowly pulsing
 *      accent dot. No placeholder logo square.
 *   3. Rotating prompt — cycles through real Echo question seeds every 4s.
 *      Tells the user what Echo IS in the same beat as the brand mark.
 *   4. One stunning primary CTA. Phone is a quiet secondary link.
 *
 * Forward navigation owned by AuthListenerProvider; both CTAs just route.
 */

const ROTATING_PROMPTS = [
  'What’s a song that always pulls you out of a bad mood?',
  'What did you outgrow this year?',
  'What’s a sentence you’ve read that you can’t forget?',
  'What’s the most expensive thing you’ve ever changed your mind about?',
  'What’s a small ritual that anchors your week?',
  'What’s an idea you keep returning to?',
];

export default function LoginScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();
  const isDark = colors.isDark;

  // Rotating prompt index — cycle every 4s with a soft cross-fade.
  const [promptIdx, setPromptIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPromptIdx(i => (i + 1) % ROTATING_PROMPTS.length), 4_000);
    return () => clearInterval(t);
  }, []);

  // Pulsing accent dot on the wordmark.
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

  // Floating orbs — extremely slow drift, very low amplitude. Adds depth
  // without distraction.
  const orb1Y = useSharedValue(0);
  const orb2Y = useSharedValue(0);
  useEffect(() => {
    orb1Y.value = withRepeat(
      withSequence(withSpring(28, { damping: 18, stiffness: 4 }), withSpring(-28, { damping: 18, stiffness: 4 })),
      -1,
      true,
    );
    orb2Y.value = withRepeat(
      withSequence(withSpring(-22, { damping: 16, stiffness: 3 }), withSpring(22, { damping: 16, stiffness: 3 })),
      -1,
      true,
    );
  }, [orb1Y, orb2Y]);
  const orb1Style = useAnimatedStyle(() => ({ transform: [{ translateY: orb1Y.value }] }));
  const orb2Style = useAnimatedStyle(() => ({ transform: [{ translateY: orb2Y.value }] }));

  const bgBase = isDark ? '#08080C' : '#FAFAFB';

  return (
    <View style={{ flex: 1, backgroundColor: bgBase }}>
      {/* Atmospheric layer */}
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
        <Animated.View style={[{
          position: 'absolute',
          top: -SCREEN_H * 0.12,
          left: -SCREEN_W * 0.25,
          width: SCREEN_W * 0.95,
          height: SCREEN_W * 0.95,
          borderRadius: SCREEN_W * 0.5,
          backgroundColor: isDark ? 'rgba(91,91,248,0.45)' : 'rgba(91,91,248,0.22)',
          opacity: 0.9,
        }, orb1Style]} />
        <Animated.View style={[{
          position: 'absolute',
          top: SCREEN_H * 0.22,
          right: -SCREEN_W * 0.30,
          width: SCREEN_W * 0.90,
          height: SCREEN_W * 0.90,
          borderRadius: SCREEN_W * 0.5,
          backgroundColor: isDark ? 'rgba(168,85,247,0.40)' : 'rgba(168,85,247,0.18)',
          opacity: 0.85,
        }, orb2Style]} />
        <View style={{
          position: 'absolute',
          bottom: -SCREEN_H * 0.08,
          left: -SCREEN_W * 0.20,
          width: SCREEN_W * 0.75,
          height: SCREEN_W * 0.75,
          borderRadius: SCREEN_W * 0.5,
          backgroundColor: isDark ? 'rgba(34,211,238,0.28)' : 'rgba(34,211,238,0.14)',
          opacity: 0.7,
        }} />
        {/* Top-to-bottom vignette to push content into focus */}
        <LinearGradient
          colors={isDark
            ? ['rgba(8,8,12,0)', 'rgba(8,8,12,0.55)', 'rgba(8,8,12,0.95)']
            : ['rgba(250,250,251,0)', 'rgba(250,250,251,0.55)', 'rgba(250,250,251,0.95)']}
          locations={[0, 0.5, 1]}
          style={{ position: 'absolute', inset: 0 }}
        />
      </View>

      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingBottom: 24 }}>

          {/* Hero — wordmark + rotating prompt */}
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Animated.View entering={FadeInDown.duration(380).springify().mass(0.7).damping(14)} style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={[font.displayBlack, { color: colors.text, fontSize: 96, letterSpacing: -4, lineHeight: 96 }]}>
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

            {/* Rotating prompt */}
            <View style={{ height: 88, marginTop: 32, justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 4 }}>
              <Animated.Text
                key={promptIdx}
                entering={FadeIn.duration(420)}
                style={[font.quote, {
                  color: colors.textSecondary,
                  fontSize: 18,
                  textAlign: 'center',
                  lineHeight: 26,
                  letterSpacing: -0.2,
                }]}
              >
                {`“${ROTATING_PROMPTS[promptIdx]}”`}
              </Animated.Text>
              <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: 12, letterSpacing: 1.5, marginTop: 14, textTransform: 'uppercase' }]}>
                A QUESTION WORTH KEEPING
              </Text>
            </View>
          </View>

          {/* CTAs */}
          <View style={{ gap: 16 }}>
            <Animated.View entering={FadeInDown.delay(120).duration(360).springify().mass(0.7)}>
              <PrimaryButton
                icon={<EnvelopeSimple color="#fff" size={20} weight="bold" />}
                label="Continue with email"
                onPress={() => router.push('/auth/email' as any)}
                bg={colors.accent}
                fg="#fff"
                radius={radius.lg}
                font={font.bodyBold}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(360)} style={{ alignItems: 'center' }}>
              <Pressable
                onPress={() => router.push('/auth/phone' as any)}
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
                <Text style={[font.bodySemibold, { color: colors.textSecondary }]}>Privacy</Text>
                .
              </Text>
            </Animated.View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Primary CTA ──

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
        <Text style={[font, { color: fg, fontSize: 16, letterSpacing: -0.2 }]}>{label}</Text>
      </Pressable>
    </View>
  );
}
