import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  ScrollView, Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Eye, EyeSlash, EnvelopeSimple, LockKey, Phone } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { signInWithGoogle, signInWithApple } from '../../lib/auth';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';

type Mode = 'email' | 'phone';
const GOOGLE_SPINNER_FAILSAFE_MS = 12_000;

function TabSwitcher({ mode, onChange, colors, radius }: {
  mode: Mode;
  onChange: (m: Mode) => void;
  colors: any;
  radius: any;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        padding: 4,
        marginBottom: 28,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceHover,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      {(['email', 'phone'] as Mode[]).map(tab => (
        <Pressable
          key={tab}
          onPress={() => onChange(tab)}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: radius.md,
            alignItems: 'center',
            backgroundColor: mode === tab ? colors.accent : 'transparent',
          }}
        >
          <Text style={{
            color: mode === tab ? '#fff' : colors.textMuted,
            fontWeight: '600',
            fontSize: 14,
            textTransform: 'capitalize',
          }}>
            {tab === 'email' ? 'Email' : 'Phone'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const [mode, setMode] = useState<Mode>('email');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [phone, setPhone] = useState('');
  const [phoneSending, setPhoneSending] = useState(false);

  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const canSubmitEmail = email.trim().length > 0 && password.length >= 6 && !loading;
  const canSubmitPhone = phone.trim().length >= 8 && !phoneSending;

  const handleLogin = async () => {
    if (!canSubmitEmail) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) { showToast(error.message, '❌'); return; }
    router.replace('/(tabs)/discover');
  };

  const handleSendCode = async () => {
    const raw = phone.trim();
    if (!raw.startsWith('+')) {
      showToast('Include country code, e.g. +1 234 567 8900', '⚠️');
      return;
    }
    setPhoneSending(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: raw });
    setPhoneSending(false);
    if (error) { showToast(error.message, '❌'); return; }
    router.push({ pathname: '/auth/verify-phone', params: { phone: raw, fromSignup: '0' } });
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    let recoveredSpinner = false;
    const spinnerFailsafe = setTimeout(() => {
      recoveredSpinner = true;
      setGoogleLoading(false);
      showToast('Google sign-in is taking longer than expected. If the browser did not open, try again.', '⚠️');
    }, GOOGLE_SPINNER_FAILSAFE_MS);

    const { error } = await signInWithGoogle();
    clearTimeout(spinnerFailsafe);
    setGoogleLoading(false);
    if (error === '__cancelled__') return;
    if (error) {
      if (!recoveredSpinner) showToast(error, '❌');
      return;
    }
    router.replace('/');
  };

  const handleApple = async () => {
    setAppleLoading(true);
    const bail = setTimeout(() => setAppleLoading(false), 60_000);
    const { error } = await signInWithApple();
    clearTimeout(bail);
    setAppleLoading(false);
    if (error === '__cancelled__') return;
    if (error) { showToast(error, '❌'); return; }
    router.replace('/');
  };

  const inputRowStyle = (focused: boolean): object => ({
    borderRadius: radius.lg,
    borderWidth: focused ? 1.5 : StyleSheet.hairlineWidth,
    borderColor: focused ? colors.accent : colors.glassBorder,
    backgroundColor: colors.inputBg,
    marginBottom: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 4,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'center', marginBottom: 40 }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 22,
                  marginBottom: 20,
                  backgroundColor: colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: colors.accent,
                  shadowOpacity: 0.35,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 8 },
                }}
              >
                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>e</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 }}>Welcome back</Text>
              <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6 }}>Sign in to your Echo account</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(80).duration(220)}>
              <TabSwitcher mode={mode} onChange={m => setMode(m)} colors={colors} radius={radius} />

              {/* ── EMAIL form ── */}
              {mode === 'email' && (
                <>
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>EMAIL</Text>
                    <View style={inputRowStyle(focusedField === 'email')}>
                      <EnvelopeSimple color={colors.textMuted} size={18} style={{ marginRight: 10 }} />
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          placeholder="you@example.com"
                          placeholderTextColor={colors.textMuted}
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="email-address"
                          returnKeyType="next"
                          onSubmitEditing={() => passwordRef.current?.focus()}
                          onFocus={() => setFocusedField('email')}
                          onBlur={() => setFocusedField(null)}
                          style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                        />
                    </View>
                  </View>

                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>PASSWORD</Text>
                    <View style={inputRowStyle(focusedField === 'password')}>
                      <LockKey color={colors.textMuted} size={18} style={{ marginRight: 10 }} />
                        <TextInput
                          ref={passwordRef}
                          value={password}
                          onChangeText={setPassword}
                          placeholder="••••••••"
                          placeholderTextColor={colors.textMuted}
                          secureTextEntry={!showPassword}
                          returnKeyType="done"
                          onSubmitEditing={handleLogin}
                          onFocus={() => setFocusedField('password')}
                          onBlur={() => setFocusedField(null)}
                          style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                        />
                        <Pressable onPress={() => setShowPassword(v => !v)} style={{ padding: 4 }}>
                          {showPassword ? <EyeSlash color={colors.textMuted} size={18} /> : <Eye color={colors.textMuted} size={18} />}
                        </Pressable>
                    </View>
                  </View>

                  <AnimatedPressable
                    onPress={() => router.push('/auth/forgot-password')}
                    style={{ alignSelf: 'flex-end', marginBottom: 24 }}
                    scaleValue={0.95}
                    haptic="light"
                  >
                    <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>Forgot password?</Text>
                  </AnimatedPressable>

                  <AnimatedPressable
                    onPress={handleLogin}
                    disabled={!canSubmitEmail}
                    scaleValue={0.97}
                    haptic="medium"
                    style={{
                      backgroundColor: canSubmitEmail ? colors.accent : colors.surfaceHover,
                      borderRadius: radius.lg,
                      paddingVertical: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: canSubmitEmail ? 1 : 0.6,
                      shadowColor: colors.accent,
                      shadowOpacity: canSubmitEmail ? 0.4 : 0,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 4 },
                      marginBottom: 24,
                    }}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Sign In</Text>}
                  </AnimatedPressable>
                </>
              )}

              {/* ── PHONE form ── */}
              {mode === 'phone' && (
                <>
                  <View style={{ marginBottom: 24 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>PHONE NUMBER</Text>
                    <View style={inputRowStyle(false)}>
                      <Phone color={colors.textMuted} size={18} style={{ marginRight: 10 }} />
                      <TextInput
                        value={phone}
                        onChangeText={setPhone}
                        placeholder="+1 234 567 8900"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="phone-pad"
                        style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                      />
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6, marginLeft: 2 }}>
                      Include country code · e.g. +44 7700 900000
                    </Text>
                  </View>

                  <AnimatedPressable
                    onPress={handleSendCode}
                    disabled={!canSubmitPhone}
                    scaleValue={0.97}
                    haptic="medium"
                    style={{
                      backgroundColor: canSubmitPhone ? colors.accent : colors.surfaceHover,
                      borderRadius: radius.lg,
                      paddingVertical: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: canSubmitPhone ? 1 : 0.6,
                      shadowColor: colors.accent,
                      shadowOpacity: canSubmitPhone ? 0.4 : 0,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 4 },
                      marginBottom: 24,
                    }}
                  >
                    {phoneSending
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Send Code</Text>}
                  </AnimatedPressable>
                </>
              )}

              {/* Divider */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.glassBorder }} />
                <Text style={{ color: colors.textMuted, paddingHorizontal: 12, fontSize: 13 }}>or continue with</Text>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.glassBorder }} />
              </View>

              {/* Social buttons */}
              <View style={{ gap: 12, marginBottom: 32 }}>
                <AnimatedPressable
                  onPress={handleGoogle}
                  disabled={googleLoading}
                  scaleValue={0.97}
                  haptic="light"
                  style={{
                    borderRadius: radius.lg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.glassBorder,
                    backgroundColor: colors.surface,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 10 }}>
                    {googleLoading ? <ActivityIndicator color={colors.text} size="small" /> : (
                      <>
                        <Text style={{ fontSize: 20 }}>G</Text>
                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>Continue with Google</Text>
                      </>
                    )}
                  </View>
                </AnimatedPressable>

                {Platform.OS === 'ios' && (
                  <AnimatedPressable
                    onPress={handleApple}
                    disabled={appleLoading}
                    scaleValue={0.97}
                    haptic="light"
                    style={{
                      overflow: 'hidden',
                      borderRadius: radius.lg,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: colors.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                      backgroundColor: colors.isDark ? '#fff' : '#000',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 10 }}>
                      {appleLoading ? <ActivityIndicator color={colors.isDark ? '#000' : '#fff'} size="small" /> : (
                        <>
                          <Text style={{ fontSize: 20 }}></Text>
                          <Text style={{ color: colors.isDark ? '#000' : '#fff', fontWeight: '600', fontSize: 15 }}>Continue with Apple</Text>
                        </>
                      )}
                    </View>
                  </AnimatedPressable>
                )}
              </View>

              {/* Sign up link */}
              <Animated.View entering={FadeInUp.delay(140).duration(220)} style={{ flexDirection: 'row', justifyContent: 'center', paddingBottom: 16 }}>
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>{`Don't have an account? `}</Text>
                <AnimatedPressable onPress={() => router.push('/auth/signup')} scaleValue={0.95} haptic="light">
                  <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>Sign up</Text>
                </AnimatedPressable>
              </Animated.View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
