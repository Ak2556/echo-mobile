import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Phone as PhoneIcon, ArrowClockwise } from 'phosphor-react-native';
import { refreshAuthSession, sendPhoneOtp, verifyPhoneOtp } from '../../lib/auth';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';
import { useI18n } from '../../lib/i18n';

const RESEND_COOLDOWN_S = 30;

export default function PhoneAuthScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();
  const layout = useResponsiveLayout();
  const { t, textDirection } = useI18n();

  const [step, setStep] = useState<'enter-phone' | 'enter-code'>('enter-phone');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [code, setCode] = useState('');
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const phoneRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    const ref = step === 'enter-phone' ? phoneRef : codeRef;
    const t = setTimeout(() => ref.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [step]);

  const canSendPhone = phoneRaw.trim().replace(/\D/g, '').length >= 7 && !loading;
  const canVerify = code.length === 6 && !loading;

  const handleSendPhone = async () => {
    if (!canSendPhone) return;
    setLoading(true);
    try {
      const { error, phone } = await sendPhoneOtp(phoneRaw);
      setLoading(false);
      if (error) { showToast(error, t('auth.error')); return; }
      setNormalizedPhone(phone);
      setStep('enter-code');
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      setLoading(false);
      showToast(e instanceof Error ? e.message : t('auth.sendCodeFailed'), t('auth.error'));
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    try {
      const { error } = await sendPhoneOtp(phoneRaw);
      setLoading(false);
      if (error) { showToast(error, t('auth.error')); return; }
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      setLoading(false);
      showToast(e instanceof Error ? e.message : t('auth.resendCodeFailed'), t('auth.error'));
    }
  };

  const handleVerify = async () => {
    if (!canVerify) return;
    setLoading(true);
    try {
      const { error } = await verifyPhoneOtp(phoneRaw, code);
      if (error) {
        setLoading(false);
        showToast(error, t('auth.error'));
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

      showToast(t('auth.signInRetry'), t('auth.error'));
    } catch (e) {
      setLoading(false);
      showToast(e instanceof Error ? e.message : t('auth.signInRetry'), t('auth.error'));
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
                  setStep('enter-phone');
                  setCode('');
                  setCooldown(0);
                } else {
                  router.back();
                }
              }}
              style={{ padding: 10, alignSelf: 'flex-start', borderRadius: 999 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              hitSlop={8}
            >
              <ArrowLeft color={colors.text} size={22} weight="bold" />
            </Pressable>
          </View>

          {step === 'enter-phone' ? (
            <View style={[layout.formStyle, { flex: 1, paddingHorizontal: layout.isWide ? 0 : 28, paddingTop: 24 }]}>

              <Text style={[font.display, textDirection, { color: colors.text, fontSize: 30, letterSpacing: -0.7, marginBottom: 10 }]}>
                {t('auth.phoneTitle')}
              </Text>
              <Text style={[font.body, textDirection, { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 36 }]}>
                {t('auth.phoneBody')}
              </Text>

              <View style={inputWrapStyle(phoneFocused)}>
                <PhoneIcon color={phoneFocused ? colors.accent : colors.textMuted} size={20} style={{ marginRight: 12 }} />
                <TextInput
                  ref={phoneRef}
                  value={phoneRaw}
                  onChangeText={setPhoneRaw}
                  placeholder="+1 555 123 4567"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  returnKeyType="send"
                  onSubmitEditing={handleSendPhone}
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
                  style={[font.body, textDirection, { flex: 1, color: colors.text, fontSize: 17, paddingVertical: 18 }]}
                />
              </View>

              <View style={ctaStyle(canSendPhone)}>
                <Pressable
                  onPress={handleSendPhone}
                  disabled={!canSendPhone}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.sendCode')}
                  style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[font.bodyBold, { color: canSendPhone ? '#fff' : colors.textMuted, fontSize: 16, letterSpacing: -0.2 }]}>{t('auth.sendCode')}</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={[layout.formStyle, { flex: 1, paddingHorizontal: layout.isWide ? 0 : 28, paddingTop: 24 }]}>

              <Text style={[font.display, textDirection, { color: colors.text, fontSize: 30, letterSpacing: -0.7, marginBottom: 10 }]}>
                {t('auth.enterCode')}
              </Text>
              <Text style={[font.body, textDirection, { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 32 }]}>
                {t('auth.sentTo')} <Text style={[font.bodyBold, { color: colors.text }]}>{normalizedPhone}</Text>
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
                  accessibilityLabel={t('auth.verifyCode')}
                  style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[font.bodyBold, { color: canVerify ? '#fff' : colors.textMuted, fontSize: 16, letterSpacing: -0.2 }]}>{t('auth.verify')}</Text>}
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
                    accessibilityLabel={cooldown > 0 ? t('auth.resendInSeconds', { count: cooldown }) : t('auth.resendCode')}
                  >
                    <ArrowClockwise color={cooldown > 0 ? colors.textMuted : colors.accent} size={16} weight="bold" />
                    <Text style={[font.bodySemibold, { color: cooldown > 0 ? colors.textMuted : colors.accent, fontSize: 14 }]}>
                      {cooldown > 0 ? t('auth.resendIn', { count: cooldown }) : t('auth.resendCode')}
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
