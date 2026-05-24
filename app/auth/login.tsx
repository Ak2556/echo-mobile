import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { EnvelopeSimple, Phone as PhoneIcon } from 'phosphor-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';

/**
 * Login screen — v1 minimum surface.
 *
 * Two providers, both maximally reliable:
 *   1. Email magic link  — primary, accent-filled CTA
 *   2. Phone OTP         — secondary, outline CTA
 *
 * No OAuth in v1. Google and Apple defer until post-launch — each adds
 * provider-specific failure modes (WebBrowser races for Google, Apple
 * Developer provisioning for Apple) that we'd rather not eat on launch
 * day. Email + SMS are commodity reliable.
 *
 * Both buttons just route — the actual auth happens on /auth/email and
 * /auth/phone. Forward navigation after sign-in is owned by
 * AuthListenerProvider in lib/auth/listener.ts.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
          {/* Hero */}
          <Animated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'center', marginBottom: 48 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 22 }}>
              <Text style={[font.displayBlack, { color: colors.text, fontSize: 42, letterSpacing: -1 }]}>echo</Text>
              <Text style={[font.displayBlack, { color: colors.accent, fontSize: 42, letterSpacing: -1, marginLeft: 1 }]}>.</Text>
            </View>
            <Text style={[font.display, { color: colors.text, fontSize: 22 }]}>Welcome</Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 14, marginTop: 6 }]}>Conversations worth keeping.</Text>
          </Animated.View>

          {/* Primary — email magic link */}
          <Animated.View entering={FadeInDown.delay(60).duration(220)} style={{ marginBottom: 12 }}>
            <AnimatedPressable
              onPress={() => router.push('/auth/email' as any)}
              haptic="medium"
              style={{
                borderRadius: radius.lg,
                backgroundColor: colors.accent,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 10,
                shadowColor: colors.accent,
                shadowOpacity: 0.35,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
              }}
              accessibilityRole="button"
              accessibilityLabel="Continue with email"
            >
              <EnvelopeSimple color="#fff" size={18} weight="bold" />
              <Text style={[font.bodyBold, { color: '#fff', fontSize: 16 }]}>
                Continue with email
              </Text>
            </AnimatedPressable>
          </Animated.View>

          {/* Secondary — phone OTP */}
          <Animated.View entering={FadeInDown.delay(120).duration(220)}>
            <AnimatedPressable
              onPress={() => router.push('/auth/phone' as any)}
              haptic="light"
              style={{
                borderRadius: radius.lg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 10,
              }}
              accessibilityRole="button"
              accessibilityLabel="Continue with phone"
            >
              <PhoneIcon color={colors.text} size={18} />
              <Text style={[font.bodySemibold, { color: colors.text, fontSize: 16 }]}>
                Continue with phone
              </Text>
            </AnimatedPressable>
          </Animated.View>

          {/* Footer */}
          <Animated.View
            entering={FadeInUp.delay(180).duration(220)}
            style={{ alignItems: 'center', marginTop: 48, paddingBottom: 8 }}
          >
            <Text style={[font.body, { color: colors.textMuted, fontSize: 13, textAlign: 'center' }]}>
              By continuing you agree to our{'\n'}Terms & Privacy.
            </Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
