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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: 'echo://auth/reset-password',
    });
    setLoading(false);
    if (error) { showToast(error.message, '❌'); return; }
    setSent(true);
  };

  const canSubmit = email.trim().length > 0 && !loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
          {/* Back */}
          <AnimatedPressable
            onPress={() => router.back()}
            style={{ position: 'absolute', top: 16, left: 24, padding: 8 }}
            scaleValue={0.9}
            haptic="light"
          >
            <ArrowLeft color="#71717A" size={24} />
          </AnimatedPressable>

          {sent ? (
            <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center' }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(16,185,129,0.15)',
                alignItems: 'center', justifyContent: 'center', marginBottom: 24,
              }}>
                <CheckCircle color="#10B981" size={40} weight="fill" />
              </View>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 12, textAlign: 'center' }}>
                Check your email
              </Text>
              <Text style={{ color: '#71717A', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 36 }}>
                We sent a password reset link to{'\n'}
                <Text style={{ color: '#A1A1AA', fontWeight: '600' }}>{email}</Text>
              </Text>
              <AnimatedPressable
                onPress={() => router.replace('/auth/login')}
                scaleValue={0.97}
                haptic="medium"
                style={{
                  backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 16,
                  paddingHorizontal: 40, alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Back to Sign In</Text>
              </AnimatedPressable>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.delay(60).springify()}>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 }}>
                Reset password
              </Text>
              <Text style={{ color: '#71717A', fontSize: 15, marginBottom: 36, lineHeight: 22 }}>
                Enter your email and we'll send you a link to reset your password.
              </Text>

              <Text style={{ color: '#A1A1AA', fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>EMAIL</Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A',
                paddingHorizontal: 14, paddingVertical: 4, marginBottom: 24,
              }}>
                <EnvelopeSimple color="#52525B" size={18} style={{ marginRight: 10 }} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#52525B"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={{ flex: 1, color: '#fff', fontSize: 16, paddingVertical: 14 }}
                />
              </View>

              <AnimatedPressable
                onPress={handleReset}
                disabled={!canSubmit}
                scaleValue={0.97}
                haptic="medium"
                style={{
                  backgroundColor: canSubmit ? '#6366F1' : '#27272A',
                  borderRadius: 14, paddingVertical: 16,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: canSubmit ? 1 : 0.6,
                  shadowColor: '#6366F1', shadowOpacity: canSubmit ? 0.4 : 0,
                  shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                }}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Send Reset Link</Text>}
              </AnimatedPressable>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
