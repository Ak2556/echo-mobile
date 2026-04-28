import React, { useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { EnvelopeSimple, Phone, ArrowLeft } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { EMAIL_RE } from '../../lib/validation';
import { signInWithGoogle, signInWithApple } from '../../lib/auth';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme, SPACING, FONT_WEIGHT } from '../../lib/theme';
import { TabSwitcher } from '../../components/auth/TabSwitcher';
import { GoogleIcon } from '../../components/auth/GoogleIcon';
import { PasswordField } from '../../components/auth/PasswordField';
import { PasswordStrengthBar } from '../../components/auth/PasswordStrengthBar';

type Mode = 'email' | 'phone';

export default function SignupScreen() {
  const router = useRouter();
  const { colors, radius, animation } = useTheme();
  const [mode, setMode] = useState<Mode>('email');

  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Phone state
  const [phone, setPhone] = useState('');
  const [phoneSending, setPhoneSending] = useState(false);

  // Social
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const mismatch = confirmPassword.length > 0 && !passwordsMatch;
  const canSubmitEmail = EMAIL_RE.test(email.trim()) && password.length >= 8 && passwordsMatch && !loading;
  const canSubmitPhone = phone.trim().length >= 8 && !phoneSending;

  const inputRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.inputBg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  };

  const handleSignup = async () => {
    if (!canSubmitEmail) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: 'echo://auth/callback' },
    });
    setLoading(false);
    if (error) { showToast(error.message, '❌'); return; }
    if (data.session === null) {
      showToast('Check your email to confirm your account', '📧');
      router.replace('/auth/confirm-email');
      return;
    }
    router.replace('/auth/setup-profile');
  };

  const handleSendCode = async () => {
    const raw = phone.trim();
    if (!raw.startsWith('+')) {
      showToast('Include country code, e.g. +1 234 567 8900', '⚠️');
      return;
    }
    setPhoneSending(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: raw });
    setPhoneSending(false);
    if (error) { showToast(error.message, '❌'); return; }
    router.push({ pathname: '/auth/verify-phone', params: { phone: raw, fromSignup: '1' } });
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) showToast(error, '❌');
  };

  const handleApple = async () => {
    setAppleLoading(true);
    const { error } = await signInWithApple();
    setAppleLoading(false);
    if (error) showToast(error, '❌');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACING.lg }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <AnimatedPressable
            onPress={() => router.back()}
            style={{ position: 'absolute', top: SPACING.md, left: 0, padding: SPACING.sm }}
            scaleValue={0.9}
            haptic="light"
          >
            <ArrowLeft color={colors.textMuted} size={24} />
          </AnimatedPressable>

          {/* Header */}
          <Animated.View
            entering={animation(FadeInDown.delay(60).springify())}
            style={{ alignItems: 'center', marginBottom: SPACING.xl, marginTop: 60 }}
          >
            <View style={{
              width: 72, height: 72, borderRadius: 22, backgroundColor: colors.accent,
              alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
              shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
            }}>
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: FONT_WEIGHT.extrabold }}>e</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 28, fontWeight: FONT_WEIGHT.extrabold, letterSpacing: -0.5 }}>Create account</Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6 }}>Join the Echo community</Text>
          </Animated.View>

          <Animated.View entering={animation(FadeInDown.delay(120).springify())}>
            <TabSwitcher mode={mode} onChange={setMode} />

            {/* ── EMAIL form — kept mounted ── */}
            <View style={{ display: mode === 'email' ? 'flex' : 'none' }}>
              <View style={{ marginBottom: SPACING.md }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.xs, marginLeft: 2 }}>EMAIL</Text>
                <View style={inputRowStyle}>
                  <EnvelopeSimple color={colors.textMuted} size={18} style={{ marginRight: SPACING.sm }} />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                  />
                </View>
                {email.length > 3 && !EMAIL_RE.test(email.trim()) && (
                  <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4, marginLeft: 2 }}>
                    Enter a valid email address
                  </Text>
                )}
              </View>

              <PasswordField
                label="PASSWORD"
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 8 characters"
                style={{ marginBottom: SPACING.xs }}
              />
              <PasswordStrengthBar password={password} />

              <View style={{ height: SPACING.md }} />

              <PasswordField
                label="CONFIRM PASSWORD"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter password"
                errorBorderColor={mismatch ? colors.danger : undefined}
                style={{ marginBottom: 4 }}
              />
              {mismatch && (
                <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4, marginLeft: 2 }}>
                  Passwords don't match
                </Text>
              )}

              <View style={{ height: SPACING.lg }} />

              <AnimatedPressable
                onPress={handleSignup}
                disabled={!canSubmitEmail}
                scaleValue={0.97}
                haptic="medium"
                style={{
                  backgroundColor: canSubmitEmail ? colors.accent : colors.surfaceHover,
                  borderRadius: radius.lg, paddingVertical: SPACING.md,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: canSubmitEmail ? 1 : 0.6,
                  shadowColor: colors.accent, shadowOpacity: canSubmitEmail ? 0.4 : 0,
                  shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  marginBottom: SPACING.lg,
                }}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: 16 }}>Create Account</Text>}
              </AnimatedPressable>
            </View>

            {/* ── PHONE form — kept mounted ── */}
            <View style={{ display: mode === 'phone' ? 'flex' : 'none' }}>
              <View style={{ marginBottom: SPACING.lg }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.xs, marginLeft: 2 }}>PHONE NUMBER</Text>
                <View style={inputRowStyle}>
                  <Phone color={colors.textMuted} size={18} style={{ marginRight: SPACING.sm }} />
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+1 234 567 8900"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                  />
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6, marginLeft: 2 }}>
                  Include country code · e.g. +44 7700 900000
                </Text>
              </View>

              <AnimatedPressable
                onPress={handleSendCode}
                disabled={!canSubmitPhone}
                scaleValue={0.97}
                haptic="medium"
                style={{
                  backgroundColor: canSubmitPhone ? colors.accent : colors.surfaceHover,
                  borderRadius: radius.lg, paddingVertical: SPACING.md,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: canSubmitPhone ? 1 : 0.6,
                  shadowColor: colors.accent, shadowOpacity: canSubmitPhone ? 0.4 : 0,
                  shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  marginBottom: SPACING.lg,
                }}
              >
                {phoneSending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: 16 }}>Send Code</Text>}
              </AnimatedPressable>
            </View>

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={{ color: colors.textMuted, paddingHorizontal: 12, fontSize: 13 }}>or continue with</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            {/* Social buttons */}
            <View style={{ gap: SPACING.sm, marginBottom: SPACING.xl }}>
              <AnimatedPressable
                onPress={handleGoogle}
                disabled={googleLoading}
                scaleValue={0.97}
                haptic="light"
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: colors.surface, borderRadius: radius.lg,
                  borderWidth: 1, borderColor: colors.border,
                  paddingVertical: 14, gap: 10,
                }}
              >
                {googleLoading ? <ActivityIndicator color={colors.text} size="small" /> : (
                  <>
                    <GoogleIcon size={20} />
                    <Text style={{ color: colors.text, fontWeight: FONT_WEIGHT.semibold, fontSize: 15 }}>Continue with Google</Text>
                  </>
                )}
              </AnimatedPressable>

              {Platform.OS === 'ios' && (
                <AnimatedPressable
                  onPress={handleApple}
                  disabled={appleLoading}
                  scaleValue={0.97}
                  haptic="light"
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#fff', borderRadius: radius.lg,
                    paddingVertical: 14, gap: 10,
                  }}
                >
                  {appleLoading ? <ActivityIndicator color="#000" size="small" /> : (
                    <>
                      <Text style={{ fontSize: 20 }}></Text>
                      <Text style={{ color: '#000', fontWeight: FONT_WEIGHT.semibold, fontSize: 15 }}>Continue with Apple</Text>
                    </>
                  )}
                </AnimatedPressable>
              )}
            </View>

            {/* Login link */}
            <Animated.View
              entering={animation(FadeInUp.delay(200).springify())}
              style={{ flexDirection: 'row', justifyContent: 'center', paddingBottom: SPACING.md }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>Already have an account? </Text>
              <AnimatedPressable onPress={() => router.replace('/auth/login')} scaleValue={0.95} haptic="light">
                <Text style={{ color: colors.accent, fontSize: 15, fontWeight: FONT_WEIGHT.bold }}>Sign in</Text>
              </AnimatedPressable>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
