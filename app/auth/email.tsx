import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, EnvelopeSimple, ArrowClockwise } from 'phosphor-react-native';
import { refreshAuthSession, sendEmailOtp, verifyEmailOtp } from '../../lib/auth';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';

const RESEND_COOLDOWN_S = 30;

export default function EmailAuthScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();
  const layout = useResponsiveLayout();

  const [step, setStep] = useState<'enter-email' | 'enter-code'>('enter-email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const emailRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    const ref = step === 'enter-email' ? emailRef : codeRef;
    const t = setTimeout(() => ref.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [step]);

  const trimmed = email.trim().toLowerCase();
  const canSend = trimmed.length > 3 && /\S+@\S+\.\S+/.test(trimmed) && !loading;
  const canVerify = code.length === 6 && !loading;

  const handleSendCode = async () => {
    if (!canSend) return;
    setLoading(true);
    try {
      const { error } = await sendEmailOtp(trimmed);
      setLoading(false);
      if (error) { showToast(error, 'Error'); return; }
      setStep('enter-code');
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      setLoading(false);
      showToast(e instanceof Error ? e.message : 'Could not send code. Try again.', 'Error');
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    try {
      const { error } = await sendEmailOtp(trimmed);
      setLoading(false);
      if (error) { showToast(error, 'Error'); return; }
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      setLoading(false);
      showToast(e instanceof Error ? e.message : 'Could not resend code. Try again.', 'Error');
    }
  };

  const handleVerify = async () => {
    if (!canVerify) return;
    setLoading(true);
    try {
      const { error } = await verifyEmailOtp(trimmed, code);
      if (error) {
        setLoading(false);
        showToast(error, 'Error');
        return;
      }

      const status = await refreshAuthSession();
      setLoading(false);

      if (status === 'ready') {
        router.replace('/(tabs)/home');
        return;
      }
      if (status === 'needs-onboarding') {
        router.replace('/auth/signup-wizard');
        return;
      }

      showToast('Sign-in did not finish. Try the code again.', 'Error');
    } catch (e) {
      setLoading(false);
      showToast(e instanceof Error ? e.message : 'Sign-in did not finish. Try the code again.', 'Error');
    }
  };

  const inputWrapStyle = (focused: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: focused ? colors.accent : colors.inputBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: colors.accent,
    shadowOpacity: focused ? 0.18 : 0,
    shadowRadius: focused ? 14 : 0,
    shadowOffset: { width: 0, height: focused ? 4 : 0 },
  });

  const ctaStyle = (active: boolean) => ({
    backgroundColor: active ? colors.accent : colors.surfaceHover,
    borderRadius: radius.lg,
    opacity: active ? 1 : 0.6,
    shadowColor: colors.accent,
    shadowOpacity: active ? 0.4 : 0,
    shadowRadius: active ? 16 : 0,
    shadowOffset: { width: 0, height: active ? 6 : 0 },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[layout.formStyle, { paddingHorizontal: 12, paddingTop: 8 }]}>
            <Pressable
              onPress={() => {
                if (step === 'enter-code') {
                  setStep('enter-email');
                  setCode('');
                  setCooldown(0);
                } else {
                  router.back();
                }
              }}
              style={{ padding: 10, alignSelf: 'flex-start', borderRadius: 999 }}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
            >
              <ArrowLeft color={colors.text} size={22} weight="bold" />
            </Pressable>
          </View>

          {step === 'enter-email' ? (
            <View style={[layout.formStyle, { flex: 1, paddingHorizontal: layout.isWide ? 0 : 28, paddingTop: 24 }]}>

              <Text style={[font.display, { color: colors.text, fontSize: 30, letterSpacing: -0.7, marginBottom: 10 }]}>
                Sign in with email
              </Text>
              <Text style={[font.body, { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 36 }]}>
                We&apos;ll send a 6-digit code to your inbox.
              </Text>

              <View style={inputWrapStyle(emailFocused)}>
                <EnvelopeSimple color={emailFocused ? colors.accent : colors.textMuted} size={20} style={{ marginRight: 12 }} />
                <TextInput
                  ref={emailRef}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="send"
                  onSubmitEditing={handleSendCode}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  style={[font.body, { flex: 1, color: colors.text, fontSize: 17, paddingVertical: 18 }]}
                />
              </View>

              <View style={ctaStyle(canSend)}>
                <Pressable
                  onPress={handleSendCode}
                  disabled={!canSend}
                  accessibilityRole="button"
                  accessibilityLabel="Send code"
                  style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[font.bodyBold, { color: canSend ? '#fff' : colors.textMuted, fontSize: 16, letterSpacing: -0.2 }]}>Send code</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={[layout.formStyle, { flex: 1, paddingHorizontal: layout.isWide ? 0 : 28, paddingTop: 24 }]}>

              <Text style={[font.display, { color: colors.text, fontSize: 30, letterSpacing: -0.7, marginBottom: 10 }]}>
                Enter the code
              </Text>
              <Text style={[font.body, { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 32 }]}>
                Sent to <Text style={[font.bodyBold, { color: colors.text }]}>{trimmed}</Text>
              </Text>

              <View style={inputWrapStyle(codeFocused)}>
                <TextInput
                  ref={codeRef}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleVerify}
                  onFocus={() => setCodeFocused(true)}
                  onBlur={() => setCodeFocused(false)}
                  style={[font.displayBlack, {
                    flex: 1,
                    color: colors.text,
                    fontSize: 32,
                    letterSpacing: 12,
                    paddingVertical: 20,
                    textAlign: 'center',
                  }]}
                  maxLength={6}
                />
              </View>

              <View style={ctaStyle(canVerify)}>
                <Pressable
                  onPress={handleVerify}
                  disabled={!canVerify}
                  accessibilityRole="button"
                  accessibilityLabel="Verify code"
                  style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[font.bodyBold, { color: canVerify ? '#fff' : colors.textMuted, fontSize: 16, letterSpacing: -0.2 }]}>Verify</Text>}
                </Pressable>
              </View>

              <View style={{ alignItems: 'center', marginTop: 18 }}>
                <View style={{
                  borderRadius: 999,
                  backgroundColor: cooldown > 0 ? 'transparent' : colors.surface,
                  borderWidth: cooldown > 0 ? 0 : 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                }}>
                  <Pressable
                    onPress={handleResend}
                    disabled={cooldown > 0 || loading}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingVertical: 12, paddingHorizontal: 20,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={cooldown > 0 ? `Resend in ${cooldown} seconds` : 'Resend code'}
                  >
                    <ArrowClockwise color={cooldown > 0 ? colors.textMuted : colors.accent} size={16} weight="bold" />
                    <Text style={[font.bodySemibold, { color: cooldown > 0 ? colors.textMuted : colors.accent, fontSize: 14 }]}>
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
