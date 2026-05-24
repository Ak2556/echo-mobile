import React, { useState } from 'react';
import {
  View, Text, Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { signInWithGoogle, CANCELLED } from '../../lib/auth';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';

/**
 * Login screen — minimum friction (v1).
 *
 * Hierarchy:
 *   1. Google native SDK                                 — primary CTA
 *   2. "Continue with email" → /auth/email (magic link)  — text link
 *   3. "Continue with phone" → /auth/phone (OTP)         — text link
 *
 * Apple Sign-In is out of scope for v1 — adds Apple Developer dependency
 * and provisioning friction that we can defer until post-launch. Re-add by
 * importing signInWithApple from lib/auth and dropping the original Apple
 * CTA back above the Google button.
 *
 * Navigation forward is owned by AuthListenerProvider — when status flips
 * to 'ready' or 'needs-onboarding', app/index.tsx catches it and routes.
 * This screen just kicks off the provider and waits.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();

  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (!error || error === CANCELLED) return;
    showToast(error, '❌');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
          {/* Hero */}
          <Animated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'center', marginBottom: 40 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 22 }}>
              <Text style={[font.displayBlack, { color: colors.text, fontSize: 42, letterSpacing: -1 }]}>echo</Text>
              <Text style={[font.displayBlack, { color: colors.accent, fontSize: 42, letterSpacing: -1, marginLeft: 1 }]}>.</Text>
            </View>
            <Text style={[font.display, { color: colors.text, fontSize: 22 }]}>Welcome back</Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 14, marginTop: 6 }]}>Conversations worth keeping.</Text>
          </Animated.View>

          {/* Primary CTA — Google */}
          <Animated.View entering={FadeInDown.delay(60).duration(220)} style={{ marginBottom: 24 }}>
            <AnimatedPressable
              onPress={handleGoogle}
              disabled={googleLoading}
              haptic="medium"
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
            >
              {googleLoading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <Text style={{ fontSize: 18 }}>G</Text>
                  <Text style={[font.bodySemibold, { color: colors.text, fontSize: 16 }]}>
                    Continue with Google
                  </Text>
                </>
              )}
            </AnimatedPressable>
          </Animated.View>

          {/* Email + phone — text links */}
          <Animated.View entering={FadeInDown.delay(120).duration(220)} style={{ gap: 4 }}>
            <Pressable
              onPress={() => router.push('/auth/email' as any)}
              style={{ paddingVertical: 14, alignItems: 'center' }}
              accessibilityRole="button"
              accessibilityLabel="Continue with email"
            >
              <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 14 }]}>
                Continue with email
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/auth/phone' as any)}
              style={{ paddingVertical: 8, alignItems: 'center' }}
              accessibilityRole="button"
              accessibilityLabel="Continue with phone"
            >
              <Text style={[font.body, { color: colors.textMuted, fontSize: 13 }]}>
                or continue with phone
              </Text>
            </Pressable>
          </Animated.View>

          {/* Footer */}
          <Animated.View
            entering={FadeInUp.delay(180).duration(220)}
            style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 40, paddingBottom: 8 }}
          >
            <Text style={[font.body, { color: colors.textMuted, fontSize: 13 }]}>
              By continuing you agree to our Terms & Privacy.
            </Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
