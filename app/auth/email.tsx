import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ArrowLeft, EnvelopeSimple, PaperPlaneTilt, ArrowClockwise, CheckCircle } from 'phosphor-react-native';
import { sendMagicLink } from '../../lib/auth';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';

/**
 * Magic-link sign-in. One screen, two visual states:
 *   1. Form     — input email, tap Send link
 *   2. Sent     — illustrated confirmation with resend cooldown
 *
 * On magic-link tap (in the user's mail client), the OS opens
 * echo://auth/callback?code=… → AuthListenerProvider consumes the code,
 * SIGNED_IN fires, status-based routing pushes the user to the wizard
 * or feed automatically.
 */
const RESEND_COOLDOWN_S = 30;

export default function EmailAuthScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();

  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Manual focus after mount — replaces `autoFocus` which interacts badly
  // with parent re-renders during keystrokes.
  useEffect(() => {
    if (sent) return;
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [sent]);

  const trimmed = email.trim();
  const canSend = trimmed.length > 3 && /\S+@\S+\.\S+/.test(trimmed) && !loading;

  const send = async () => {
    if (!canSend) return;
    setLoading(true);
    const { error } = await sendMagicLink(email);
    setLoading(false);
    if (error) { showToast(error, '❌'); return; }
    setSent(true);
    setCooldown(RESEND_COOLDOWN_S);
  };

  const resend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    const { error } = await sendMagicLink(email);
    setLoading(false);
    if (error) { showToast(error, '❌'); return; }
    setCooldown(RESEND_COOLDOWN_S);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Back chevron */}
          <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
            <Pressable
              onPress={() => router.back()}
              style={{ padding: 10, alignSelf: 'flex-start', borderRadius: 999 }}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
            >
              <ArrowLeft color={colors.text} size={22} weight="bold" />
            </Pressable>
          </View>

          {!sent ? (
            <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24 }}>
              {/* Icon hero */}
              <View style={{
                width: 64, height: 64, borderRadius: 18,
                backgroundColor: colors.accentMuted,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 22,
              }}>
                <EnvelopeSimple color={colors.accent} size={28} weight="duotone" />
              </View>

              <Text style={[font.display, { color: colors.text, fontSize: 30, letterSpacing: -0.7, marginBottom: 10 }]}>
                Sign in with email
              </Text>
              <Text style={[font.body, { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 36 }]}>
                We&apos;ll send a one-tap link to your inbox. No password to remember.
              </Text>

              {/* Email input — stable style shape across focus toggle */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
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
              }}>
                <EnvelopeSimple color={focused ? colors.accent : colors.textMuted} size={20} style={{ marginRight: 12 }} />
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
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  style={[font.body, { flex: 1, color: colors.text, fontSize: 17, paddingVertical: 18 }]}
                />
              </View>

              {/* Send button — stable style shape */}
              <View style={{
                backgroundColor: canSend ? colors.accent : colors.surfaceHover,
                borderRadius: radius.lg,
                opacity: canSend ? 1 : 0.6,
                shadowColor: colors.accent,
                shadowOpacity: canSend ? 0.4 : 0,
                shadowRadius: canSend ? 16 : 0,
                shadowOffset: { width: 0, height: canSend ? 6 : 0 },
              }}>
                <Pressable
                  onPress={send}
                  disabled={!canSend}
                  accessibilityRole="button"
                  accessibilityLabel="Send magic link"
                  style={{
                    paddingVertical: 18,
                    alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'row', gap: 10,
                  }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <PaperPlaneTilt color={canSend ? '#fff' : colors.textMuted} size={18} weight="fill" />
                      <Text style={[font.bodyBold, { color: canSend ? '#fff' : colors.textMuted, fontSize: 16, letterSpacing: -0.2 }]}>
                        Send magic link
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1, paddingHorizontal: 28, paddingTop: 32, alignItems: 'center' }}>
              <View style={{
                width: 96, height: 96, borderRadius: 28,
                backgroundColor: colors.accentMuted,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 28,
              }}>
                <CheckCircle color={colors.accent} size={48} weight="duotone" />
              </View>

              <Text style={[font.display, { color: colors.text, fontSize: 28, letterSpacing: -0.6, marginBottom: 12, textAlign: 'center' }]}>
                Check your inbox
              </Text>
              <Text style={[font.body, { color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 8 }]}>
                We sent a one-tap link to
              </Text>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 16, marginBottom: 28 }]}>
                {trimmed.toLowerCase()}
              </Text>

              <View style={{
                borderRadius: 999,
                backgroundColor: cooldown > 0 ? 'transparent' : colors.surface,
                borderWidth: cooldown > 0 ? 0 : 1,
                borderColor: colors.border,
                overflow: 'hidden',
              }}>
                <Pressable
                  onPress={resend}
                  disabled={cooldown > 0 || loading}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingVertical: 14, paddingHorizontal: 20,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={cooldown > 0 ? `Resend in ${cooldown} seconds` : 'Resend link'}
                >
                  <ArrowClockwise color={cooldown > 0 ? colors.textMuted : colors.accent} size={16} weight="bold" />
                  <Text style={[font.bodySemibold, { color: cooldown > 0 ? colors.textMuted : colors.accent, fontSize: 14 }]}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => { setSent(false); setEmail(''); setCooldown(0); setTimeout(() => inputRef.current?.focus(), 50); }}
                style={{ paddingVertical: 14, marginTop: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Use a different email"
              >
                <Text style={[font.body, { color: colors.textMuted, fontSize: 13 }]}>
                  Use a different email
                </Text>
              </Pressable>
            </Animated.View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
