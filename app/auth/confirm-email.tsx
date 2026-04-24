import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { EnvelopeSimple, ArrowClockwise, Warning } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

export default function ConfirmEmailScreen() {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    // Grab email to show in the UI
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) setUserEmail(data.session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        router.replace('/auth/setup-profile');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Countdown for resend cooldown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleResend = async () => {
    if (countdown > 0) return;
    setResending(true);
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (!email) {
      showToast('Please sign up again', '❌');
      router.replace('/auth/signup');
      setResending(false);
      return;
    }
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: 'echo://auth/callback' },
    });
    setResending(false);
    if (error) { showToast(error.message, '❌'); return; }
    showToast('Confirmation email resent', '📧');
    setCountdown(60);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center', width: '100%' }}>
          {/* Icon */}
          <View style={{
            width: 96, height: 96, borderRadius: 48,
            backgroundColor: 'rgba(99,102,241,0.15)',
            alignItems: 'center', justifyContent: 'center', marginBottom: 28,
          }}>
            <EnvelopeSimple color="#6366F1" size={44} weight="duotone" />
          </View>

          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center', marginBottom: 12 }}>
            Confirm your email
          </Text>

          <Text style={{ color: '#71717A', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 10 }}>
            We sent a confirmation link to
          </Text>
          {userEmail ? (
            <Text style={{ color: '#A1A1AA', fontSize: 15, fontWeight: '600', textAlign: 'center', marginBottom: 10 }}>
              {userEmail}
            </Text>
          ) : null}
          <Text style={{ color: '#71717A', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
            Tap the link in that email to activate your account.
          </Text>

          {/* Spam notice */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: 'rgba(245,158,11,0.08)',
            borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
            paddingVertical: 14, paddingHorizontal: 16, marginBottom: 32, width: '100%',
          }}>
            <Warning color="#F59E0B" size={18} weight="fill" style={{ marginTop: 1 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700' }}>Check your spam folder</Text>
              <Text style={{ color: '#A1A1AA', fontSize: 12, lineHeight: 17 }}>
                Confirmation emails can land in spam or promotions. If it still hasn't arrived after a minute, tap Resend below.
              </Text>
            </View>
          </View>

          {/* Resend button */}
          <AnimatedPressable
            onPress={handleResend}
            disabled={countdown > 0}
            scaleValue={0.97}
            haptic="light"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: '#18181B', borderRadius: 14,
              borderWidth: 1, borderColor: countdown > 0 ? '#27272A' : '#3F3F46',
              paddingVertical: 14, paddingHorizontal: 24,
              marginBottom: 16, opacity: countdown > 0 ? 0.5 : 1,
            }}
          >
            {resending
              ? <ActivityIndicator color="#6366F1" size="small" />
              : <ArrowClockwise color="#6366F1" size={18} />}
            <Text style={{ color: '#6366F1', fontWeight: '600', fontSize: 15 }}>
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend email'}
            </Text>
          </AnimatedPressable>

          <AnimatedPressable onPress={() => router.replace('/auth/login')} scaleValue={0.95} haptic="light">
            <Text style={{ color: '#52525B', fontSize: 14 }}>Back to sign in</Text>
          </AnimatedPressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
