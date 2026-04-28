import React, { useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, EnvelopeSimple, CheckCircle } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme, SPACING, FONT_WEIGHT } from '../../lib/theme';
import { EMAIL_RE } from '../../lib/validation';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors, radius, animation } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const emailValid = EMAIL_RE.test(email.trim());
  const canSubmit = emailValid && !loading;

  const handleReset = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: 'echo://auth/reset-password',
    });
    setLoading(false);
    if (error) { showToast(error.message, '❌'); return; }
    setSent(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, paddingHorizontal: SPACING.lg, justifyContent: 'center' }}>
          {/* Back */}
          <AnimatedPressable
            onPress={() => router.back()}
            style={{ position: 'absolute', top: SPACING.md, left: SPACING.lg, padding: SPACING.sm }}
            scaleValue={0.9}
            haptic="light"
          >
            <ArrowLeft color={colors.textMuted} size={24} />
          </AnimatedPressable>

          {sent ? (
            <Animated.View entering={animation(FadeInDown.springify())} style={{ alignItems: 'center' }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: 'rgba(16,185,129,0.15)',
                alignItems: 'center', justifyContent: 'center',
                marginBottom: SPACING.lg,
              }}>
                <CheckCircle color="#10B981" size={40} weight="fill" />
              </View>
              <Text style={{
                color: colors.text, fontSize: 24,
                fontWeight: FONT_WEIGHT.extrabold,
                marginBottom: SPACING.sm, textAlign: 'center',
              }}>
                Check your email
              </Text>
              <Text style={{
                color: colors.textMuted, fontSize: 15,
                textAlign: 'center', lineHeight: 22,
                marginBottom: SPACING.xl,
              }}>
                We sent a password reset link to{'\n'}
                <Text style={{ color: colors.textSecondary, fontWeight: FONT_WEIGHT.semibold }}>{email}</Text>
              </Text>
              <AnimatedPressable
                onPress={() => router.replace('/auth/login')}
                scaleValue={0.97}
                haptic="medium"
                style={{
                  backgroundColor: colors.accent,
                  borderRadius: radius.lg,
                  paddingVertical: SPACING.md,
                  paddingHorizontal: SPACING.xl,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: 16 }}>Back to Sign In</Text>
              </AnimatedPressable>
            </Animated.View>
          ) : (
            <Animated.View entering={animation(FadeInDown.delay(60).springify())}>
              <Text style={{
                color: colors.text, fontSize: 28,
                fontWeight: FONT_WEIGHT.extrabold,
                letterSpacing: -0.5, marginBottom: SPACING.xs,
              }}>
                Reset password
              </Text>
              <Text style={{
                color: colors.textMuted, fontSize: 15,
                marginBottom: SPACING.xl, lineHeight: 22,
              }}>
                Enter your email and we'll send you a link to reset your password.
              </Text>

              <Text style={{
                color: colors.textSecondary, fontSize: 12,
                fontWeight: FONT_WEIGHT.semibold,
                marginBottom: SPACING.xs, marginLeft: 2,
              }}>
                EMAIL
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: colors.inputBg,
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderColor: email.length > 3 && !emailValid ? colors.danger : colors.inputBorder,
                paddingHorizontal: SPACING.md, paddingVertical: 4,
                marginBottom: 4,
              }}>
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
              {email.length > 3 && !emailValid && (
                <Text style={{ color: colors.danger, fontSize: 12, marginBottom: SPACING.md, marginLeft: 4 }}>
                  Enter a valid email address
                </Text>
              )}

              <View style={{ height: email.length > 3 && !emailValid ? 0 : SPACING.lg }} />

              <AnimatedPressable
                onPress={handleReset}
                disabled={!canSubmit}
                scaleValue={0.97}
                haptic="medium"
                style={{
                  backgroundColor: canSubmit ? colors.accent : colors.surfaceHover,
                  borderRadius: radius.lg, paddingVertical: SPACING.md,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: canSubmit ? 1 : 0.6,
                  shadowColor: colors.accent, shadowOpacity: canSubmit ? 0.4 : 0,
                  shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                }}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: 16 }}>Send Reset Link</Text>}
              </AnimatedPressable>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
