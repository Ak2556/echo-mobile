import React, { useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LockSimple, Eye, EyeSlash, CheckCircle } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors, radius, fontSizes } = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const isStrong = password.length >= 8;
  const matches = password === confirm;
  const canSubmit = isStrong && matches && !loading;

  const handleReset = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      showToast(error.message, '❌');
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center' }}>
            <View style={{
              width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(16,185,129,0.15)',
              alignItems: 'center', justifyContent: 'center', marginBottom: 24,
            }}>
              <CheckCircle color={colors.success} size={40} weight="fill" />
            </View>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 12, textAlign: 'center' }}>
              Password updated
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 36 }}>
              Your password has been changed successfully.
            </Text>
            <AnimatedPressable
              onPress={() => router.replace('/(tabs)/discover')}
              scaleValue={0.97}
              haptic="medium"
              style={{
                backgroundColor: colors.accent, borderRadius: radius.lg,
                paddingVertical: 16, paddingHorizontal: 40, alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Go to app</Text>
            </AnimatedPressable>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
          <Animated.View entering={FadeInDown.delay(60).springify()}>
            <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 }}>
              Set new password
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, marginBottom: 36, lineHeight: 22 }}>
              Choose a strong password — at least 8 characters.
            </Text>

            {/* New password */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>
              NEW PASSWORD
            </Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: colors.surface, borderRadius: radius.lg,
              borderWidth: 1, borderColor: colors.border,
              paddingHorizontal: 14, paddingVertical: 4, marginBottom: 14,
            }}>
              <LockSimple color={colors.textMuted} size={18} style={{ marginRight: 10 }} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 8 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
              />
              <AnimatedPressable onPress={() => setShowPassword(v => !v)} scaleValue={0.88} haptic="light">
                {showPassword
                  ? <EyeSlash color={colors.textMuted} size={18} />
                  : <Eye color={colors.textMuted} size={18} />}
              </AnimatedPressable>
            </View>

            {/* Confirm password */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>
              CONFIRM PASSWORD
            </Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: colors.surface, borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: confirm.length > 0 && !matches ? colors.danger : colors.border,
              paddingHorizontal: 14, paddingVertical: 4, marginBottom: 8,
            }}>
              <LockSimple color={colors.textMuted} size={18} style={{ marginRight: 10 }} />
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Repeat password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
              />
            </View>
            {confirm.length > 0 && !matches && (
              <Text style={{ color: colors.danger, fontSize: fontSizes.caption, marginBottom: 8, marginLeft: 2 }}>
                Passwords don't match
              </Text>
            )}

            <AnimatedPressable
              onPress={handleReset}
              disabled={!canSubmit}
              scaleValue={0.97}
              haptic="medium"
              style={{
                backgroundColor: canSubmit ? colors.accent : colors.surfaceHover,
                borderRadius: radius.lg, paddingVertical: 16,
                alignItems: 'center', justifyContent: 'center',
                opacity: canSubmit ? 1 : 0.6,
                marginTop: 8,
                shadowColor: colors.accent, shadowOpacity: canSubmit ? 0.4 : 0,
                shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Update password</Text>}
            </AnimatedPressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
