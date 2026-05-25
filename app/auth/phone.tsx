import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Phone as PhoneIcon, ArrowClockwise, ShieldCheck } from 'phosphor-react-native';
import { sendPhoneOtp, verifyPhoneOtp } from '../../lib/auth';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';

/**
 * Phone OTP sign-in — single screen, two internal steps.
 *
 *   step = 'enter-phone' → input number, Send code
 *   step = 'enter-code'  → 6-digit input + Verify, with 30s resend
 *
 * NOTE on flicker prevention:
 *   - No Animated.View entering on the form regions — the entering animation
 *     was re-firing on every keystroke (Reanimated v3 quirk inside parent
 *     re-renders), causing the input to flicker and lose focus.
 *   - Input wrapper styles are STABLE shape (always include shadow keys with
 *     0 opacity when blurred) so RN doesn't see a different style object on
 *     focus toggle.
 *   - `autoFocus` replaced by ref + useEffect to control re-focus timing.
 *
 * Forward navigation owned by AuthListenerProvider on SIGNED_IN.
 */
const RESEND_COOLDOWN_S = 30;

export default function PhoneAuthScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();

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

  // Manual focus management — avoids autoFocus + parent-rerender quirks.
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
    const { error, phone } = await sendPhoneOtp(phoneRaw);
    setLoading(false);
    if (error) { showToast(error, '❌'); return; }
    setNormalizedPhone(phone);
    setStep('enter-code');
    setCooldown(RESEND_COOLDOWN_S);
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    const { error } = await sendPhoneOtp(phoneRaw);
    setLoading(false);
    if (error) { showToast(error, '❌'); return; }
    setCooldown(RESEND_COOLDOWN_S);
  };

  const handleVerify = async () => {
    if (!canVerify) return;
    setLoading(true);
    const { error } = await verifyPhoneOtp(phoneRaw, code);
    setLoading(false);
    if (error) { showToast(error, '❌'); return; }
    // SIGNED_IN → AuthListenerProvider → status nav → wizard or feed.
  };

  // Stable input wrapper style — all keys always present so the style shape
  // doesn't change on focus toggle. Shadow opacity drives the focus glow.
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
          {/* Back chevron — also handles "back a step" within this screen */}
          <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
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
              accessibilityLabel="Back"
              hitSlop={8}
            >
              <ArrowLeft color={colors.text} size={22} weight="bold" />
            </Pressable>
          </View>

          {step === 'enter-phone' ? (
            <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 18,
                backgroundColor: colors.accentMuted,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 22,
              }}>
                <PhoneIcon color={colors.accent} size={28} weight="duotone" />
              </View>

              <Text style={[font.display, { color: colors.text, fontSize: 30, letterSpacing: -0.7, marginBottom: 10 }]}>
                Sign in with phone
              </Text>
              <Text style={[font.body, { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 36 }]}>
                We&apos;ll text you a 6-digit code. Include your country code.
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
                  style={[font.body, { flex: 1, color: colors.text, fontSize: 17, paddingVertical: 18 }]}
                />
              </View>

              <View style={ctaStyle(canSendPhone)}>
                <Pressable
                  onPress={handleSendPhone}
                  disabled={!canSendPhone}
                  accessibilityRole="button"
                  accessibilityLabel="Send code"
                  style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[font.bodyBold, { color: canSendPhone ? '#fff' : colors.textMuted, fontSize: 16, letterSpacing: -0.2 }]}>Send code</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 18,
                backgroundColor: colors.accentMuted,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 22,
              }}>
                <ShieldCheck color={colors.accent} size={30} weight="duotone" />
              </View>

              <Text style={[font.display, { color: colors.text, fontSize: 30, letterSpacing: -0.7, marginBottom: 10 }]}>
                Enter the code
              </Text>
              <Text style={[font.body, { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 32 }]}>
                Sent to <Text style={[font.bodyBold, { color: colors.text }]}>{normalizedPhone}</Text>
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
