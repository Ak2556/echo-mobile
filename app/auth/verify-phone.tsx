import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Phone, ArrowLeft, ArrowClockwise } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

export default function VerifyPhoneScreen() {
  const router = useRouter();
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
    router.replace(fromSignup === '1' ? '/auth/signup-wizard' : '/');
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          {/* Back */}
          <AnimatedPressable
            onPress={() => router.back()}
            style={{ position: 'absolute', top: 16, left: 16, padding: 8 }}
            scaleValue={0.9}
            haptic="light"
          >
            <ArrowLeft color="#71717A" size={24} />
          </AnimatedPressable>

          <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center', width: '100%' }}>
            {/* Icon */}
            <View style={{
              width: 96, height: 96, borderRadius: 48,
              backgroundColor: 'rgba(99,102,241,0.15)',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 28,
            }}>
              <Phone color="#6366F1" size={44} weight="duotone" />
            </View>

            <Text style={{
              color: '#fff', fontSize: 26, fontWeight: '800',
              letterSpacing: -0.5, textAlign: 'center', marginBottom: 10,
            }}>
              Enter the code
            </Text>
            <Text style={{
              color: '#71717A', fontSize: 15, textAlign: 'center',
              lineHeight: 22, marginBottom: 36,
            }}>
              We sent a 6-digit SMS code to{'\n'}
              <Text style={{ color: '#A1A1AA', fontWeight: '600' }}>{phone}</Text>
            </Text>

            {/* Single OTP input */}
            <TextInput
              value={code}
              onChangeText={v => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="· · · · · ·"
              placeholderTextColor="#3F3F46"
              autoFocus
              style={{
                backgroundColor: '#18181B',
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: code.length === 6 ? '#6366F1' : '#27272A',
                color: '#fff',
                fontSize: 30,
                fontWeight: '700',
                letterSpacing: 14,
                textAlign: 'center',
                paddingVertical: 18,
                paddingHorizontal: 20,
                width: '100%',
                marginBottom: 24,
              }}
            />

            {/* Verify button */}
            <AnimatedPressable
              onPress={handleVerify}
              disabled={!canVerify}
              scaleValue={0.97}
              haptic="medium"
              style={{
                backgroundColor: canVerify ? '#6366F1' : '#27272A',
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: canVerify ? 1 : 0.55,
                shadowColor: '#6366F1',
                shadowOpacity: canVerify ? 0.4 : 0,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                width: '100%',
                marginBottom: 20,
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Verify Code</Text>}
            </AnimatedPressable>

            {/* Resend */}
            <AnimatedPressable
              onPress={handleResend}
              disabled={!canResend}
              scaleValue={0.95}
              haptic="light"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}
            >
              <ArrowClockwise color={canResend ? '#6366F1' : '#3F3F46'} size={16} />
              <Text style={{
                color: canResend ? '#6366F1' : '#3F3F46',
                fontSize: 14, fontWeight: '600',
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
