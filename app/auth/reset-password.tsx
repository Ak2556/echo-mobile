import React, { useState } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme, SPACING, FONT_WEIGHT } from '../../lib/theme';
import { PasswordField } from '../../components/auth/PasswordField';
import { PasswordStrengthBar } from '../../components/auth/PasswordStrengthBar';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors, radius, animation } = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= 8 && password === confirm && !loading;

  const handleReset = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      showToast(error.message, '❌');
      return;
    }
    showToast('Password updated!', '✅');
    router.replace('/auth/login');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, paddingHorizontal: SPACING.lg, justifyContent: 'center' }}>
          <Animated.View entering={animation(FadeInDown.delay(40).springify())}>
            <Text style={{
              color: colors.text, fontSize: 28,
              fontWeight: FONT_WEIGHT.extrabold,
              letterSpacing: -0.5, marginBottom: SPACING.xs,
            }}>
              Set new password
            </Text>
            <Text style={{
              color: colors.textMuted, fontSize: 15,
              marginBottom: SPACING.xl, lineHeight: 22,
            }}>
              Choose a strong password of at least 8 characters.
            </Text>

            <PasswordField
              label="NEW PASSWORD"
              value={password}
              onChangeText={setPassword}
              placeholder="New password"
              style={{ marginBottom: SPACING.xs }}
            />

            <PasswordStrengthBar password={password} />

            <View style={{ height: SPACING.md }} />

            <PasswordField
              label="CONFIRM PASSWORD"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm password"
              errorBorderColor={mismatch ? colors.danger : undefined}
              style={{ marginBottom: 4 }}
            />
            {mismatch && (
              <Text style={{
                color: colors.danger, fontSize: 12,
                marginBottom: SPACING.sm, marginLeft: 4,
              }}>
                Passwords do not match
              </Text>
            )}

            <View style={{ height: SPACING.lg }} />

            <AnimatedPressable
              onPress={handleReset}
              disabled={!canSubmit}
              scaleValue={0.97}
              haptic="medium"
              style={{
                backgroundColor: canSubmit ? colors.accent : colors.surfaceHover,
                borderRadius: radius.lg, paddingVertical: SPACING.md,
                alignItems: 'center', justifyContent: 'center',
                opacity: canSubmit ? 1 : 0.6,
                shadowColor: colors.accent, shadowOpacity: canSubmit ? 0.4 : 0,
                shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: 16 }}>Update Password</Text>}
            </AnimatedPressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
