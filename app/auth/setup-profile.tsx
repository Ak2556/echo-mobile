import React, { useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { User, At } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme, SPACING, FONT_WEIGHT } from '../../lib/theme';
import { AuthFlowProgress } from '../../components/auth/AuthFlowProgress';

const AVATAR_COLORS = [
  '#6366F1', '#EC4899', '#10B981', '#F59E0B', '#3B82F6',
  '#8B5CF6', '#EF4444', '#06B6D4', '#84CC16', '#F97316',
];

export default function SetupProfileScreen() {
  const router = useRouter();
  const { colors, radius, animation } = useTheme();
  const setUsername          = useAppStore(s => s.setUsername);
  const setDisplayName       = useAppStore(s => s.setDisplayName);
  const setUserId            = useAppStore(s => s.setUserId);
  const setAvatarColor       = useAppStore(s => s.setAvatarColor);
  const setHasSeenOnboarding = useAppStore(s => s.setHasSeenOnboarding);
  const [displayName, setDisplayNameLocal] = useState('');
  const [username, setUsernameLocal] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const usernameClean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const canSubmit = displayName.trim().length >= 1 && usernameClean.length >= 2 && !loading;
  const initial = displayName.trim().charAt(0).toUpperCase();

  const handleSave = async () => {
    if (!canSubmit) return;
    setLoading(true);

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      showToast('Session expired. Please sign in again.', '❌');
      setLoading(false);
      router.replace('/auth/login');
      return;
    }

    const userId = session.user.id;

    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      username: usernameClean,
      display_name: displayName.trim(),
      avatar_color: selectedColor,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      if (error.code === '23505') {
        showToast('Username taken. Try another.', '❌');
      } else {
        showToast(error.message, '❌');
      }
      setLoading(false);
      return;
    }

    setUserId(userId);
    setUsername(usernameClean);
    setDisplayName(displayName.trim());
    setAvatarColor(selectedColor);
    setHasSeenOnboarding(true);

    setLoading(false);
    router.replace('/(tabs)/discover');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACING.lg }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={animation(FadeInDown.delay(60).springify())} style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
            <AuthFlowProgress steps={['Account', 'Confirm', 'Profile']} currentStep={2} />

            {/* Avatar preview */}
            <View style={{
              width: 88, height: 88, borderRadius: 44, backgroundColor: selectedColor,
              alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
              shadowColor: selectedColor, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
            }}>
              {initial
                ? <Text style={{ color: '#fff', fontSize: 36, fontWeight: FONT_WEIGHT.extrabold }}>{initial}</Text>
                : <User color="#fff" size={36} />}
            </View>
            <Text style={{
              color: colors.text, fontSize: 28,
              fontWeight: FONT_WEIGHT.extrabold, letterSpacing: -0.5,
            }}>
              Set up your profile
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6, textAlign: 'center' }}>
              Let others know who you are
            </Text>
          </Animated.View>

          <Animated.View entering={animation(FadeInDown.delay(120).springify())}>
            {/* Display Name */}
            <View style={{ marginBottom: SPACING.md }}>
              <Text style={{
                color: colors.textSecondary, fontSize: 12,
                fontWeight: FONT_WEIGHT.semibold,
                marginBottom: SPACING.xs, marginLeft: 2,
              }}>
                DISPLAY NAME
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: colors.inputBg,
                borderRadius: radius.lg,
                borderWidth: 1.5, borderColor: colors.inputBorder,
                paddingHorizontal: SPACING.md, paddingVertical: 4,
              }}>
                <User color={colors.textMuted} size={18} style={{ marginRight: SPACING.sm }} />
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayNameLocal}
                  placeholder="Your name"
                  placeholderTextColor={colors.textMuted}
                  maxLength={40}
                  style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                />
              </View>
            </View>

            {/* Username */}
            <View style={{ marginBottom: SPACING.lg }}>
              <Text style={{
                color: colors.textSecondary, fontSize: 12,
                fontWeight: FONT_WEIGHT.semibold,
                marginBottom: SPACING.xs, marginLeft: 2,
              }}>
                USERNAME
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: colors.inputBg,
                borderRadius: radius.lg,
                borderWidth: 1.5, borderColor: colors.inputBorder,
                paddingHorizontal: SPACING.md, paddingVertical: 4,
              }}>
                <At color={colors.textMuted} size={18} style={{ marginRight: 6 }} />
                <TextInput
                  value={username}
                  onChangeText={setUsernameLocal}
                  placeholder="yourhandle"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
                />
                {usernameClean.length > 0 && (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>@{usernameClean}</Text>
                )}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6, marginLeft: 2 }}>
                Only letters, numbers, and underscores. Min. 2 characters.
              </Text>
            </View>

            {/* Avatar color picker */}
            <View style={{ marginBottom: SPACING.xl }}>
              <Text style={{
                color: colors.textSecondary, fontSize: 12,
                fontWeight: FONT_WEIGHT.semibold,
                marginBottom: SPACING.sm, marginLeft: 2,
              }}>
                AVATAR COLOR
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
                {AVATAR_COLORS.map(color => (
                  <AnimatedPressable
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    scaleValue={0.88}
                    haptic="light"
                    style={{
                      width: 40, height: 40, borderRadius: 20, backgroundColor: color,
                      borderWidth: selectedColor === color ? 3 : 0,
                      borderColor: '#fff',
                    }}
                    accessibilityLabel={`Select avatar color ${color}`}
                    accessibilityRole="radio"
                  />
                ))}
              </View>
            </View>

            {/* Save button */}
            <AnimatedPressable
              onPress={handleSave}
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
                marginBottom: SPACING.xl,
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: 16 }}>Let's go →</Text>}
            </AnimatedPressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
