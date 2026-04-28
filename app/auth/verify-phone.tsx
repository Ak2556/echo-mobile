import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Phone, ArrowLeft, ArrowClockwise } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme, SPACING, FONT_WEIGHT } from '../../lib/theme';
import { OTPInput } from '../../components/auth/OTPInput';
import { AuthFlowProgress } from '../../components/auth/AuthFlowProgress';

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const { colors, radius, animation } = useTheme();
  const { phone, fromSignup } = useLocalSearchParams<{ phone: string; fromSignup?: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startCountdown();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCountdown = () => {
    setCountdown(30);
    setCanResend(false);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleVerify = async () => {
    if (code.length !== 6 || !phone) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });
    setLoading(false);
    if (error) {
      showToast(error.message, '❌');
      setCode('');
      return;
    }
    router.replace(fromSignup === '1' ? '/auth/setup-profile' : '/');
  };

  const handleResend = async () => {
    if (!phone || !canResend) return;
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) { showToast(error.message, '❌'); return; }
    showToast('Code resent', '📱');
    startCountdown();
  };

  const canVerify = code.length === 6 && !loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl }}>
          {/* Back */}
          <AnimatedPressable
            onPress={() => router.back()}
            style={{ position: 'absolute', top: SPACING.md, left: SPACING.md, padding: SPACING.sm }}
            scaleValue={0.9}
            haptic="light"
          >
            <ArrowLeft color={colors.textMuted} size={24} />
          </AnimatedPressable>

          <Animated.View entering={animation(FadeInDown.springify())} style={{ alignItems: 'center', width: '100%' }}>
            <AuthFlowProgress steps={['Phone', 'Verify', 'Profile']} currentStep={1} />

            {/* Icon */}
            <View style={{
              width: 96, height: 96, borderRadius: 48,
              backgroundColor: colors.accentMuted,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: SPACING.lg,
            }}>
              <Phone color={colors.accent} size={44} weight="duotone" />
            </View>

            <Text style={{
              color: colors.text, fontSize: 26, fontWeight: FONT_WEIGHT.extrabold,
              letterSpacing: -0.5, textAlign: 'center', marginBottom: SPACING.xs,
            }}>
              Enter the code
            </Text>
            <Text style={{
              color: colors.textMuted, fontSize: 15, textAlign: 'center',
              lineHeight: 22, marginBottom: SPACING.xl,
            }}>
              We sent a 6-digit SMS code to{'\n'}
              <Text style={{ color: colors.textSecondary, fontWeight: FONT_WEIGHT.semibold }}>{phone}</Text>
            </Text>

            <OTPInput value={code} onChange={setCode} autoFocus />

            <View style={{ height: SPACING.lg }} />

            {/* Verify button */}
            <AnimatedPressable
              onPress={handleVerify}
              disabled={!canVerify}
              scaleValue={0.97}
              haptic="medium"
              style={{
                backgroundColor: canVerify ? colors.accent : colors.surfaceHover,
                borderRadius: radius.lg,
                paddingVertical: SPACING.md,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: canVerify ? 1 : 0.55,
                shadowColor: colors.accent,
                shadowOpacity: canVerify ? 0.4 : 0,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                width: '100%',
                marginBottom: SPACING.md,
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: 16 }}>Verify Code</Text>}
            </AnimatedPressable>

            {/* Resend */}
            <AnimatedPressable
              onPress={handleResend}
              disabled={!canResend}
              scaleValue={0.95}
              haptic="light"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}
            >
              <ArrowClockwise color={canResend ? colors.accent : colors.border} size={16} />
              <Text style={{
                color: canResend ? colors.accent : colors.textMuted,
                fontSize: 14, fontWeight: FONT_WEIGHT.semibold,
              }}>
                {canResend ? 'Resend code' : `Resend in ${countdown}s`}
              </Text>
            </AnimatedPressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
