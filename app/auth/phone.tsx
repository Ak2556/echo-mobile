import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Phone as PhoneIcon, ArrowClockwise } from 'phosphor-react-native';
import { sendPhoneOtp, verifyPhoneOtp } from '../../lib/auth';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';

/**
 * Phone OTP — single screen, two internal steps.
 *
 *   step = 'enter-phone' → user types number → "Send code" → SMS arrives
 *   step = 'enter-code'  → user types 6-digit OTP → verify → SIGNED_IN
 *
 * Forward navigation is owned by AuthListenerProvider — on successful
 * verifyOtp, SIGNED_IN fires, listener hydrates, app/index.tsx routes.
 *
 * Resend has a 30s cooldown.
 */
const RESEND_COOLDOWN_S = 30;

export default function PhoneAuthScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();

  const [step, setStep] = useState<'enter-phone' | 'enter-code'>('enter-phone');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Auto-focus code field when entering step 2
  useEffect(() => {
    if (step !== 'enter-code') return;
    const t = setTimeout(() => codeRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [step]);

  const canSendPhone = phoneRaw.trim().replace(/\D/g, '').length >= 7 && !loading;
  const canVerify = code.trim().length === 6 && !loading;

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
    // SIGNED_IN fires → AuthListenerProvider hydrates → index.tsx routes.
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
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
              style={{ padding: 8, alignSelf: 'flex-start' }}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
            >
              <ArrowLeft color={colors.text} size={22} />
            </Pressable>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            {step === 'enter-phone' ? (
              <Animated.View entering={FadeInDown.duration(220)}>
                <Text style={[font.display, { color: colors.text, fontSize: 28, letterSpacing: -0.5, marginBottom: 8 }]}>
                  Continue with phone
                </Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 15, marginBottom: 28 }]}>
                  We&apos;ll text you a 6-digit code to sign in.
                </Text>

                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border, backgroundColor: colors.inputBg,
                  paddingHorizontal: 14, marginBottom: 20,
                }}>
                  <PhoneIcon color={colors.textMuted} size={18} style={{ marginRight: 10 }} />
                  <TextInput
                    value={phoneRaw}
                    onChangeText={setPhoneRaw}
                    placeholder="+1 555 123 4567"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    returnKeyType="send"
                    onSubmitEditing={handleSendPhone}
                    autoFocus
                    style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                  />
                </View>

                <AnimatedPressable
                  onPress={handleSendPhone}
                  disabled={!canSendPhone}
                  haptic="medium"
                  style={{
                    backgroundColor: canSendPhone ? colors.accent : colors.surfaceHover,
                    borderRadius: radius.lg,
                    paddingVertical: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: canSendPhone ? 1 : 0.6,
                  }}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[font.bodyBold, { color: '#fff', fontSize: 16 }]}>Send code</Text>}
                </AnimatedPressable>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInDown.duration(220)}>
                <Text style={[font.display, { color: colors.text, fontSize: 28, letterSpacing: -0.5, marginBottom: 8 }]}>
                  Enter the code
                </Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 15, marginBottom: 28 }]}>
                  Sent to <Text style={[font.bodySemibold, { color: colors.text }]}>{normalizedPhone}</Text>
                </Text>

                <View style={{
                  borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border, backgroundColor: colors.inputBg,
                  paddingHorizontal: 14, marginBottom: 20,
                }}>
                  <TextInput
                    ref={codeRef}
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleVerify}
                    style={{
                      color: colors.text,
                      fontSize: 28,
                      letterSpacing: 8,
                      paddingVertical: 16,
                      textAlign: 'center',
                      fontVariant: ['tabular-nums'],
                    }}
                    maxLength={6}
                  />
                </View>

                <AnimatedPressable
                  onPress={handleVerify}
                  disabled={!canVerify}
                  haptic="medium"
                  style={{
                    backgroundColor: canVerify ? colors.accent : colors.surfaceHover,
                    borderRadius: radius.lg,
                    paddingVertical: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: canVerify ? 1 : 0.6,
                    marginBottom: 14,
                  }}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[font.bodyBold, { color: '#fff', fontSize: 16 }]}>Verify</Text>}
                </AnimatedPressable>

                <Pressable
                  onPress={handleResend}
                  disabled={cooldown > 0 || loading}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingVertical: 12, alignSelf: 'center',
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={cooldown > 0 ? `Resend code in ${cooldown} seconds` : 'Resend code'}
                >
                  <ArrowClockwise color={cooldown > 0 ? colors.textMuted : colors.accent} size={16} />
                  <Text style={[font.bodySemibold, { color: cooldown > 0 ? colors.textMuted : colors.accent, fontSize: 14 }]}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </Animated.View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
