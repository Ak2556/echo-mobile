import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { EnvelopeSimple, ArrowClockwise, Warning } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme, SPACING, FONT_WEIGHT } from '../../lib/theme';
import { AuthFlowProgress } from '../../components/auth/AuthFlowProgress';

export default function ConfirmEmailScreen() {
  const router = useRouter();
  const { colors, radius, animation } = useTheme();
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl }}>
        <Animated.View entering={animation(FadeInDown.springify())} style={{ alignItems: 'center', width: '100%' }}>
          <AuthFlowProgress steps={['Account', 'Confirm', 'Profile']} currentStep={1} />

          {/* Icon */}
          <View style={{
            width: 96, height: 96, borderRadius: 48,
            backgroundColor: colors.accentMuted,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: SPACING.lg,
          }}>
            <EnvelopeSimple color={colors.accent} size={44} weight="duotone" />
          </View>

          <Text style={{
            color: colors.text, fontSize: 26,
            fontWeight: FONT_WEIGHT.extrabold,
            letterSpacing: -0.5, textAlign: 'center',
            marginBottom: SPACING.sm,
          }}>
            Confirm your email
          </Text>

          <Text style={{
            color: colors.textMuted, fontSize: 15,
            textAlign: 'center', lineHeight: 22,
            marginBottom: SPACING.xs,
          }}>
            We sent a confirmation link to
          </Text>
          {userEmail ? (
            <Text style={{
              color: colors.textSecondary, fontSize: 15,
              fontWeight: FONT_WEIGHT.semibold,
              textAlign: 'center', marginBottom: SPACING.xs,
            }}>
              {userEmail}
            </Text>
          ) : null}
          <Text style={{
            color: colors.textMuted, fontSize: 15,
            textAlign: 'center', lineHeight: 22,
            marginBottom: SPACING.lg,
          }}>
            Tap the link in that email to activate your account.
          </Text>

          {/* Spam notice — amber is intentionally fixed (semantic warning color) */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
            backgroundColor: 'rgba(245,158,11,0.08)',
            borderRadius: radius.lg,
            borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
            paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
            marginBottom: SPACING.xl, width: '100%',
          }}>
            <Warning color="#F59E0B" size={18} weight="fill" style={{ marginTop: 1 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: FONT_WEIGHT.bold }}>Check your spam folder</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
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
              flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: countdown > 0 ? colors.border : colors.inputBorder,
              paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
              marginBottom: SPACING.md, opacity: countdown > 0 ? 0.5 : 1,
            }}
          >
            {resending
              ? <ActivityIndicator color={colors.accent} size="small" />
              : <ArrowClockwise color={colors.accent} size={18} />}
            <Text style={{ color: colors.accent, fontWeight: FONT_WEIGHT.semibold, fontSize: 15 }}>
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend email'}
            </Text>
          </AnimatedPressable>

          <AnimatedPressable onPress={() => router.replace('/auth/login')} scaleValue={0.95} haptic="light">
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Back to sign in</Text>
          </AnimatedPressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
