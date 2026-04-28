import React, { useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LockKey, Eye, EyeSlash } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
          <Animated.View entering={FadeInDown.delay(40).springify()}>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 }}>
              Set new password
            </Text>
            <Text style={{ color: '#71717A', fontSize: 15, marginBottom: 36, lineHeight: 22 }}>
              Choose a strong password of at least 8 characters.
            </Text>

            <Text style={{ color: '#A1A1AA', fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>NEW PASSWORD</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A',
              paddingHorizontal: 14, paddingVertical: 4, marginBottom: 16,
            }}>
              <LockKey color="#52525B" size={18} style={{ marginRight: 10 }} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
                placeholderTextColor="#52525B"
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, color: '#fff', fontSize: 16, paddingVertical: 14 }}
              />
              <AnimatedPressable onPress={() => setShowPw(p => !p)} scaleValue={0.9} haptic="none">
                {showPw
                  ? <EyeSlash color="#52525B" size={18} />
                  : <Eye color="#52525B" size={18} />}
              </AnimatedPressable>
            </View>

            <Text style={{ color: '#A1A1AA', fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 }}>CONFIRM PASSWORD</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1,
              borderColor: confirm.length > 0 && confirm !== password ? '#EF4444' : '#27272A',
              paddingHorizontal: 14, paddingVertical: 4, marginBottom: 8,
            }}>
              <LockKey color="#52525B" size={18} style={{ marginRight: 10 }} />
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirm password"
                placeholderTextColor="#52525B"
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, color: '#fff', fontSize: 16, paddingVertical: 14 }}
              />
            </View>
            {confirm.length > 0 && confirm !== password && (
              <Text style={{ color: '#EF4444', fontSize: 12, marginBottom: 16, marginLeft: 4 }}>
                Passwords do not match
              </Text>
            )}

            <View style={{ height: 24 }} />

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
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Update Password</Text>}
            </AnimatedPressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
