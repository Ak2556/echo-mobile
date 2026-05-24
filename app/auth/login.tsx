import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  ScrollView, Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Eye, EyeSlash, EnvelopeSimple, LockKey } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { signInWithGoogle, signInWithApple } from '../../lib/auth';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';

const GOOGLE_SPINNER_FAILSAFE_MS = 12_000;

/**
 * Login screen — designed for minimum friction.
 *
 * Hierarchy:
 *   1. Apple Sign-In (iOS only, native, one-tap) — primary CTA, full-width black/white
 *   2. Google — secondary, equal height, hairline border
 *   3. "Continue with email" — text link that expands the email form on tap
 *
 * What's gone vs v1:
 *   • Phone OTP — added friction, rarely used, can come back as /auth/phone later
 *   • Tab switcher between Email/Phone — choice paralysis on the most important
 *     screen
 *   • Email form mounted by default — most users will tap Apple/Google; rendering
 *     the form upfront makes the screen feel like a corporate sign-in page
 *
 * Sign-up uses the same providers — no separate signup screen for OAuth flows.
 * The "Sign up" link at the bottom routes to email-based signup-wizard for
 * users who explicitly want a password account.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const canSubmitEmail = email.trim().length > 0 && password.length >= 6 && !loading;

  const handleLogin = async () => {
    if (!canSubmitEmail) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) { showToast(error.message, '❌'); return; }
    router.replace('/');
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    let recovered = false;
    const failsafe = setTimeout(() => {
      recovered = true;
      setGoogleLoading(false);
      showToast('Google sign-in is taking longer than expected. Try again, or use email below.', '⚠️');
    }, GOOGLE_SPINNER_FAILSAFE_MS);
    const { error } = await signInWithGoogle();
    clearTimeout(failsafe);
    setGoogleLoading(false);
    if (error === '__cancelled__') return;
    if (error) {
      if (!recovered) showToast(error, '❌');
      return;
    }
    router.replace('/');
  };

  const handleApple = async () => {
    setAppleLoading(true);
    const bail = setTimeout(() => setAppleLoading(false), 60_000);
    const { error } = await signInWithApple();
    clearTimeout(bail);
    setAppleLoading(false);
    if (error === '__cancelled__') return;
    if (error) { showToast(error, '❌'); return; }
    router.replace('/');
  };

  const inputRowStyle = (focused: boolean): object => ({
    borderRadius: radius.lg,
    borderWidth: focused ? 1.5 : StyleSheet.hairlineWidth,
    borderColor: focused ? colors.accent : colors.border,
    backgroundColor: colors.inputBg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 4,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Hero */}
            <Animated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'center', marginBottom: 40 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 22 }}>
                <Text style={[font.displayBlack, { color: colors.text, fontSize: 42, letterSpacing: -1 }]}>echo</Text>
                <Text style={[font.displayBlack, { color: colors.accent, fontSize: 42, letterSpacing: -1, marginLeft: 1 }]}>.</Text>
              </View>
              <Text style={[font.display, { color: colors.text, fontSize: 22 }]}>Welcome back</Text>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 14, marginTop: 6 }]}>Conversations worth keeping.</Text>
            </Animated.View>

            {/* Primary CTAs — Apple first on iOS, Google always */}
            <Animated.View entering={FadeInDown.delay(60).duration(220)} style={{ gap: 12, marginBottom: 24 }}>
              {Platform.OS === 'ios' && (
                <AnimatedPressable
                  onPress={handleApple}
                  disabled={appleLoading}
                  haptic="medium"
                  style={{
                    borderRadius: radius.lg,
                    backgroundColor: colors.isDark ? '#fff' : '#000',
                    paddingVertical: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 10,
                    shadowColor: '#000',
                    shadowOpacity: colors.isDark ? 0 : 0.2,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  {appleLoading ? (
                    <ActivityIndicator color={colors.isDark ? '#000' : '#fff'} />
                  ) : (
                    <>
                      <Text style={{ fontSize: 18, color: colors.isDark ? '#000' : '#fff' }}></Text>
                      <Text style={[font.bodySemibold, { color: colors.isDark ? '#000' : '#fff', fontSize: 16 }]}>
                        Continue with Apple
                      </Text>
                    </>
                  )}
                </AnimatedPressable>
              )}

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

            {/* Email — collapsed by default, taps to open */}
            <Animated.View entering={FadeInDown.delay(120).duration(220)}>
              {!emailFormOpen ? (
                <Pressable
                  onPress={() => setEmailFormOpen(true)}
                  style={{ paddingVertical: 14, alignItems: 'center' }}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with email"
                >
                  <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 14 }]}>
                    Continue with email
                  </Text>
                </Pressable>
              ) : (
                <View style={{ gap: 12 }}>
                  <View style={inputRowStyle(focusedField === 'email')}>
                    <EnvelopeSimple color={colors.textMuted} size={18} style={{ marginRight: 10 }} />
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                      autoFocus
                    />
                  </View>

                  <View style={inputRowStyle(focusedField === 'password')}>
                    <LockKey color={colors.textMuted} size={18} style={{ marginRight: 10 }} />
                    <TextInput
                      ref={passwordRef}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Password"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showPassword}
                      returnKeyType="done"
                      onSubmitEditing={handleLogin}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                    />
                    <Pressable onPress={() => setShowPassword(v => !v)} style={{ padding: 4 }} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword ? <EyeSlash color={colors.textMuted} size={18} /> : <Eye color={colors.textMuted} size={18} />}
                    </Pressable>
                  </View>

                  <AnimatedPressable
                    onPress={handleLogin}
                    disabled={!canSubmitEmail}
                    haptic="medium"
                    style={{
                      backgroundColor: canSubmitEmail ? colors.accent : colors.surfaceHover,
                      borderRadius: radius.lg,
                      paddingVertical: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: canSubmitEmail ? 1 : 0.6,
                      shadowColor: colors.accent,
                      shadowOpacity: canSubmitEmail ? 0.35 : 0,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 4 },
                    }}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={[font.bodyBold, { color: '#fff', fontSize: 16 }]}>Sign in</Text>}
                  </AnimatedPressable>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 }}>
                    <Pressable onPress={() => setEmailFormOpen(false)} accessibilityRole="button">
                      <Text style={[font.body, { color: colors.textMuted, fontSize: 13 }]}>Back</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push('/auth/forgot-password')} accessibilityRole="button">
                      <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 13 }]}>Forgot password?</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Animated.View>

            {/* Sign up link */}
            <Animated.View
              entering={FadeInUp.delay(180).duration(220)}
              style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 40, paddingBottom: 8 }}
            >
              <Text style={[font.body, { color: colors.textMuted, fontSize: 14 }]}>{`New to Echo? `}</Text>
              <Pressable onPress={() => router.push('/auth/signup-wizard')} accessibilityRole="button">
                <Text style={[font.bodyBold, { color: colors.accent, fontSize: 14 }]}>Create an account</Text>
              </Pressable>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
