import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { EnvelopeSimple, ArrowClockwise } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

export default function ConfirmEmailScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  // Poll for session — fires once the user taps the email link and the
  // onAuthStateChange in _layout.tsx handles the actual redirect.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        router.replace('/auth/setup-profile');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleResend = async () => {
    setChecking(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) {
      await supabase.auth.resend({
        type: 'signup',
        email: session.user.email,
        options: { emailRedirectTo: 'echo://auth/callback' },
      });
      showToast('Confirmation email resent', '📧');
    } else {
      showToast('Please sign up again', '❌');
      router.replace('/auth/signup');
    }
    setChecking(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center' }}>
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
          <Text style={{ color: '#71717A', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 40 }}>
            We sent a confirmation link to your email.{'\n'}
            Tap the link to activate your account.{'\n\n'}
            <Text style={{ color: '#52525B', fontSize: 13 }}>The app will open automatically once confirmed.</Text>
          </Text>

          <AnimatedPressable
            onPress={handleResend}
            scaleValue={0.97}
            haptic="light"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: '#18181B', borderRadius: 14,
              borderWidth: 1, borderColor: '#27272A',
              paddingVertical: 14, paddingHorizontal: 24,
              marginBottom: 16,
            }}
          >
            {checking
              ? <ActivityIndicator color="#6366F1" size="small" />
              : <ArrowClockwise color="#6366F1" size={18} />}
            <Text style={{ color: '#6366F1', fontWeight: '600', fontSize: 15 }}>Resend email</Text>
          </AnimatedPressable>

          <AnimatedPressable onPress={() => router.replace('/auth/login')} scaleValue={0.95} haptic="light">
            <Text style={{ color: '#52525B', fontSize: 14 }}>Back to sign in</Text>
          </AnimatedPressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
