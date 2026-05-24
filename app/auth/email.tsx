import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, EnvelopeSimple, PaperPlaneTilt, ArrowClockwise } from 'phosphor-react-native';
import { sendMagicLink } from '../../lib/auth';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';

/**
 * Magic-link sign-in.
 *
 * Two visual states owned by `sent`:
 *   1. Input form — user types email, taps "Send link"
 *   2. Confirmation — "Check your inbox" with resend cooldown
 *
 * On tap of the magic link in the email, the OS opens
 * `echo://auth/callback?code=…` which the central AuthListenerProvider
 * picks up via Linking. SIGNED_IN fires, the listener hydrates the store,
 * and app/index.tsx redirects forward. This screen doesn't need to know
 * the magic link came back — it just sits on the confirmation state.
 *
 * Resend has a 30s cooldown to prevent abuse.
 */
const RESEND_COOLDOWN_S = 30;

export default function EmailAuthScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);

  // Cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const canSend = email.trim().length > 3 && /\S+@\S+\.\S+/.test(email.trim()) && !loading;

  const send = async () => {
    if (!canSend && !sent) return;
    if (sent && cooldown > 0) return;
    setLoading(true);
    const { error } = await sendMagicLink(email);
    setLoading(false);
    if (error) { showToast(error, '❌'); return; }
    setSent(true);
    setCooldown(RESEND_COOLDOWN_S);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Pressable
              onPress={() => router.back()}
              style={{ padding: 8, alignSelf: 'flex-start' }}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
            >
              <ArrowLeft color={colors.text} size={22} />
            </Pressable>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            {!sent ? (
              <Animated.View entering={FadeInDown.duration(220)}>
                <Text style={[font.display, { color: colors.text, fontSize: 28, letterSpacing: -0.5, marginBottom: 8 }]}>
                  Continue with email
                </Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 15, marginBottom: 28 }]}>
                  We&apos;ll send you a one-tap link to sign in. No password needed.
                </Text>

                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border, backgroundColor: colors.inputBg,
                  paddingHorizontal: 14, marginBottom: 20,
                }}>
                  <EnvelopeSimple color={colors.textMuted} size={18} style={{ marginRight: 10 }} />
                  <TextInput
                    ref={inputRef}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="send"
                    onSubmitEditing={send}
                    autoFocus
                    style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                  />
                </View>

                <AnimatedPressable
                  onPress={send}
                  disabled={!canSend}
                  haptic="medium"
                  style={{
                    backgroundColor: canSend ? colors.accent : colors.surfaceHover,
                    borderRadius: radius.lg,
                    paddingVertical: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 10,
                    opacity: canSend ? 1 : 0.6,
                  }}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <>
                        <PaperPlaneTilt color="#fff" size={18} weight="fill" />
                        <Text style={[font.bodyBold, { color: '#fff', fontSize: 16 }]}>Send magic link</Text>
                      </>
                    )}
                </AnimatedPressable>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'center' }}>
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: `${colors.accent}22`,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: 24,
                }}>
                  <EnvelopeSimple color={colors.accent} size={32} weight="duotone" />
                </View>
                <Text style={[font.display, { color: colors.text, fontSize: 24, letterSpacing: -0.5, marginBottom: 10, textAlign: 'center' }]}>
                  Check your inbox
                </Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 28 }]}>
                  We sent a link to{'\n'}
                  <Text style={[font.bodySemibold, { color: colors.text }]}>{email.trim().toLowerCase()}</Text>
                  {'\n'}Tap it to sign in.
                </Text>

                <Pressable
                  onPress={send}
                  disabled={cooldown > 0 || loading}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingVertical: 12, paddingHorizontal: 16,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={cooldown > 0 ? `Resend in ${cooldown} seconds` : 'Resend link'}
                >
                  <ArrowClockwise color={cooldown > 0 ? colors.textMuted : colors.accent} size={16} />
                  <Text style={[font.bodySemibold, { color: cooldown > 0 ? colors.textMuted : colors.accent, fontSize: 14 }]}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => { setSent(false); setEmail(''); setCooldown(0); }}
                  style={{ paddingVertical: 12 }}
                  accessibilityRole="button"
                >
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 13 }]}>
                    Use a different email
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
