import React, { useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Eye, EyeSlash, EnvelopeSimple, LockKey } from 'phosphor-react-native';
import { Platform as RNPlatform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { signInWithGoogle, signInWithApple } from '../../lib/auth';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) {
      showToast(error.message, '❌');
    }
    // Success: onAuthStateChange in _layout.tsx will trigger index.tsx redirect
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) showToast(error, '❌');
  };

  const handleApple = async () => {
    setAppleLoading(true);
    const { error } = await signInWithApple();
    setAppleLoading(false);
    if (error) showToast(error, '❌');
  };

  const canSubmit = email.trim().length > 0 && password.length >= 6 && !loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.delay(60).springify()} style={{ alignItems: 'center', marginBottom: 48 }}>
            <View style={{
              width: 72, height: 72, borderRadius: 22, backgroundColor: '#6366F1',
              alignItems: 'center', justifyContent: 'center', marginBottom: 20,
              shadowColor: '#6366F1', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
            }}>
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>e</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 }}>Welcome back</Text>
            <Text style={{ color: '#71717A', fontSize: 15, marginTop: 6 }}>Sign in to your Echo account</Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeInDown.delay(120).springify()}>
            {/* Email */}
            <View style={{ marginBottom: 14 }}>
              <Text style={{ color: '#A1A1AA', fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>EMAIL</Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A',
                paddingHorizontal: 14, paddingVertical: 4,
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
            </View>

            {/* Password */}
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: '#A1A1AA', fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>PASSWORD</Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A',
                paddingHorizontal: 14, paddingVertical: 4,
              }}>
                <LockKey color="#52525B" size={18} style={{ marginRight: 10 }} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#52525B"
                  secureTextEntry={!showPassword}
                  style={{ flex: 1, color: '#fff', fontSize: 16, paddingVertical: 14 }}
                />
                <Pressable onPress={() => setShowPassword(v => !v)} style={{ padding: 4 }}>
                  {showPassword
                    ? <EyeSlash color="#52525B" size={18} />
                    : <Eye color="#52525B" size={18} />}
                </Pressable>
              </View>
            </View>

            {/* Forgot password */}
            <AnimatedPressable
              onPress={() => router.push('/auth/forgot-password')}
              style={{ alignSelf: 'flex-end', marginBottom: 24 }}
              scaleValue={0.95}
              haptic="light"
            >
              <Text style={{ color: '#6366F1', fontSize: 14, fontWeight: '600' }}>Forgot password?</Text>
            </AnimatedPressable>

            {/* Sign In button */}
            <AnimatedPressable
              onPress={handleLogin}
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
                marginBottom: 24,
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Sign In</Text>}
            </AnimatedPressable>

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#27272A' }} />
              <Text style={{ color: '#52525B', paddingHorizontal: 12, fontSize: 13 }}>or continue with</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#27272A' }} />
            </View>

            {/* Social buttons */}
            <View style={{ gap: 12, marginBottom: 32 }}>
              {/* Google */}
              <AnimatedPressable
                onPress={handleGoogle}
                disabled={googleLoading}
                scaleValue={0.97}
                haptic="light"
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A',
                  paddingVertical: 14, gap: 10,
                }}
              >
                {googleLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Text style={{ fontSize: 20 }}>G</Text>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Continue with Google</Text>
                  </>
                )}
              </AnimatedPressable>

              {/* Apple — iOS only */}
              {RNPlatform.OS === 'ios' && (
                <AnimatedPressable
                  onPress={handleApple}
                  disabled={appleLoading}
                  scaleValue={0.97}
                  haptic="light"
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#fff', borderRadius: 14,
                    paddingVertical: 14, gap: 10,
                  }}
                >
                  {appleLoading ? <ActivityIndicator color="#000" size="small" /> : (
                    <>
                      <Text style={{ fontSize: 20 }}></Text>
                      <Text style={{ color: '#000', fontWeight: '600', fontSize: 15 }}>Continue with Apple</Text>
                    </>
                  )}
                </AnimatedPressable>
              )}
            </View>

            {/* Sign up link */}
            <Animated.View entering={FadeInUp.delay(200).springify()} style={{ flexDirection: 'row', justifyContent: 'center', paddingBottom: 16 }}>
              <Text style={{ color: '#71717A', fontSize: 15 }}>Don't have an account? </Text>
              <AnimatedPressable onPress={() => router.push('/auth/signup')} scaleValue={0.95} haptic="light">
                <Text style={{ color: '#6366F1', fontSize: 15, fontWeight: '700' }}>Sign up</Text>
              </AnimatedPressable>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
