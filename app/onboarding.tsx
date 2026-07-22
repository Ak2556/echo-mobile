import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Target } from 'phosphor-react-native';
import { useAuth } from '../lib/auth';
import { track } from '../lib/analytics';
import { TARGET_CATEGORIES, getTargetCategory } from '../lib/targetCategories';
import { useResponsiveLayout } from '../lib/responsive';
import { useTheme } from '../lib/theme';
import { useAppStore } from '../store/useAppStore';
import { TextInput } from '../components/ui/TextInput';

/**
 * Optional "set a goal" screen.
 *
 * Formerly the mandatory first-run "target system" funnel (pick a goal → AI
 * chat → publish a draft) that new users hit before any value. That funnel is
 * retired — value now comes first via /welcome. This is what remains: a single
 * focused step to point Echo at a goal, reachable on demand from the /welcome
 * reveal, the home Progress chip, and Settings. Setting a target still drives
 * TargetToolsPanel + target-progress; nothing here is required.
 */
export default function SetGoalScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const { colors, radius, font } = useTheme();
  const layout = useResponsiveLayout();
  const storedTargetCategory = useAppStore(s => s.targetCategory);
  const storedTargetOutcome = useAppStore(s => s.targetOutcome);
  const setStoredTargetCategory = useAppStore(s => s.setTargetCategory);
  const setStoredTargetOutcome = useAppStore(s => s.setTargetOutcome);
  const setStoredTargetMiniApps = useAppStore(s => s.setTargetMiniApps);

  const [selectedTargetId, setSelectedTargetId] = useState(storedTargetCategory);
  const [targetOutcome, setTargetOutcome] = useState(storedTargetOutcome);
  const selectedTarget = useMemo(() => getTargetCategory(selectedTargetId), [selectedTargetId]);
  const recommendedAppNames = selectedTarget.apps.map(app => app.replace(/-/g, ' ')).join(' · ');

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('product_onboarding_started');
  }, []);

  useEffect(() => {
    if (status === 'signed-out') router.replace('/auth/login');
    if (status === 'needs-onboarding') router.replace('/auth/signup-wizard');
  }, [router, status]);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const saveGoal = () => {
    setStoredTargetCategory(selectedTarget.id);
    setStoredTargetOutcome(targetOutcome.trim());
    setStoredTargetMiniApps(selectedTarget.apps);
    track('goal_set', { target: selectedTarget.id });
    leave();
  };

  const skip = () => {
    track('product_onboarding_skipped', { step: 'target' });
    leave();
  };

  if (status === 'checking') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: layout.gutter,
            paddingTop: layout.isDesktop ? 56 : 28,
            paddingBottom: 28,
          }}
        >
          <View style={[layout.formStyle, { flex: 1, justifyContent: 'center' }]}>
            <Text style={[font.eyebrow, { color: colors.textMuted, marginBottom: 14 }]}>
              Set a goal · optional
            </Text>
            <Text style={[font.display, {
              color: colors.text,
              fontSize: layout.isPhone ? 30 : 40,
              lineHeight: layout.isPhone ? 35 : 46,
              letterSpacing: -0.3,
              marginBottom: 10,
            }]}>
              Point Echo at what you want next.
            </Text>
            <Text style={[font.body, { color: colors.textSecondary, fontSize: 16, lineHeight: 23, marginBottom: 24, maxWidth: 560 }]}>
              Pick a target and Echo tailors mini-apps, habits, notes and prompts around the outcome you want. You can change or skip this anytime.
            </Text>

            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
                {TARGET_CATEGORIES.map(category => (
                  <TargetChip
                    key={category.id}
                    label={category.label}
                    active={category.id === selectedTarget.id}
                    onPress={() => setSelectedTargetId(category.id)}
                  />
                ))}
              </View>
              <View>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 14, marginBottom: 8 }]}>
                  Desired output
                </Text>
                <TextInput
                  value={targetOutcome}
                  onChangeText={setTargetOutcome}
                  maxLength={140}
                  placeholder="Example: lose 8 kg, pass an exam, post 3 times a week..."
                  style={{ minHeight: 58 }}
                />
              </View>
              <View style={{
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                padding: 15,
              }}>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 15, marginBottom: 4 }]}>
                  {selectedTarget.label}: {selectedTarget.outcome}
                </Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 19 }]}>
                  {selectedTarget.starter}
                </Text>
                <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 12, marginTop: 10, textTransform: 'capitalize' }]}>
                  {recommendedAppNames}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <PrimaryButton label="Save goal" icon={<Target color="#fff" size={18} weight="bold" />} onPress={saveGoal} />
                <SecondaryButton label="Maybe later" onPress={skip} />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TargetChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, radius, font } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        minHeight: 38,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? `${colors.accent}22` : colors.surface,
        paddingHorizontal: 13,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[font.bodySemibold, { color: active ? colors.accent : colors.textSecondary, fontSize: 13 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors, radius, font } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{
        minHeight: 50,
        borderRadius: radius.lg,
        backgroundColor: colors.accent,
        opacity: disabled ? 0.55 : 1,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
      }}
    >
      {icon}
      <Text style={[font.bodyBold, { color: '#fff', fontSize: 15 }]}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, radius, font } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        minHeight: 50,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: 18,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[font.bodyBold, { color: colors.textSecondary, fontSize: 15 }]}>{label}</Text>
    </Pressable>
  );
}
