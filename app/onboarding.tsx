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
import { Target, ArrowRight } from 'phosphor-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../lib/auth';
import { track } from '../lib/analytics';
import { TARGET_CATEGORIES, getTargetCategory } from '../lib/targetCategories';
import { useResponsiveLayout } from '../lib/responsive';
import { useTheme } from '../lib/theme';
import { useAppStore } from '../store/useAppStore';
import { TextInput } from '../components/ui/TextInput';
import { ttx } from '../lib/i18n';

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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
        <LinearGradient
          colors={colors.isDark
            ? ['rgba(224,96,48,0.08)', 'transparent', 'rgba(0,0,0,0.0)']
            : ['rgba(224,96,48,0.06)', 'transparent']}
          locations={colors.isDark ? [0, 0.45, 1] : [0, 1]}
          style={{ position: 'absolute', inset: 0 }}
        />
      </View>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: layout.gutter,
              paddingTop: layout.isDesktop ? 64 : 32,
              paddingBottom: 32,
            }}
          >
            <View style={[layout.formStyle, { flex: 1, justifyContent: 'center' }]}>
              <Animated.View entering={FadeInDown.duration(400).springify().mass(0.6).damping(16)}>
                <Text style={[font.eyebrow, { color: colors.textMuted, marginBottom: 14, letterSpacing: 1.5 }]}>
                  {ttx("SET A GOAL · OPTIONAL").toUpperCase()}
                </Text>
                <Text style={[font.display, {
                  color: colors.text,
                  fontSize: layout.isPhone ? 32 : 44,
                  lineHeight: layout.isPhone ? 38 : 50,
                  letterSpacing: -0.5,
                  marginBottom: 12,
                }]}>
                  {ttx("Point Echo at what you want next.")}
                </Text>
                <Text style={[font.body, { color: colors.textSecondary, fontSize: 17, lineHeight: 26, marginBottom: 32, maxWidth: 560 }]}>
                  {ttx("Pick a target and Echo tailors mini-apps, habits, notes and prompts around the outcome you want. You can change or skip this anytime.")}
                </Text>
              </Animated.View>

              <View style={{ gap: 20 }}>
                <Animated.View entering={FadeInDown.delay(100).duration(400).springify().mass(0.7)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {TARGET_CATEGORIES.map(category => (
                    <TargetChip
                      key={category.id}
                      label={category.label}
                      active={category.id === selectedTarget.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedTargetId(category.id);
                      }}
                    />
                  ))}
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(150).duration(400).springify().mass(0.7)}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 14, marginBottom: 10 }]}>
                    {ttx("Desired output")}
                  </Text>
                  <TextInput
                    value={targetOutcome}
                    onChangeText={setTargetOutcome}
                    maxLength={140}
                    placeholder={ttx("Example: lose 8 kg, pass an exam, post 3 times a week...")}
                    style={{ minHeight: 64, fontSize: 16, backgroundColor: colors.isDark ? '#1C1C1E' : '#F2F2F7', borderWidth: 0 }}
                  />
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(200).duration(400).springify().mass(0.7)} style={{
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.05)',
                  backgroundColor: colors.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  padding: 20,
                  shadowColor: '#000',
                  shadowOpacity: 0.1,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 16, marginBottom: 6 }]}>
                    {selectedTarget.label}: {selectedTarget.outcome}
                  </Text>
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 14, lineHeight: 22 }]}>
                    {selectedTarget.starter}
                  </Text>
                  <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 13, marginTop: 14, textTransform: 'capitalize', letterSpacing: 0.2 }]}>
                    {recommendedAppNames}
                  </Text>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(250).duration(400).springify().mass(0.7)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
                  <PrimaryButton label={ttx("Save goal")} icon={<Target color="#fff" size={20} weight="fill" />} onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    saveGoal();
                  }} />
                  <SecondaryButton label={ttx("Maybe later")} onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    skip();
                  }} />
                </Animated.View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
}

function TargetChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, radius, font } = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withTiming(0.94, { duration: 100 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={{
          minHeight: 44,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: active ? colors.accent : colors.isDark ? '#3F3F46' : '#E5E5EA',
          backgroundColor: active ? colors.accent : colors.isDark ? '#18181B' : '#FFFFFF',
          paddingHorizontal: 18,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: active ? colors.accent : '#000',
          shadowOpacity: active ? 0.3 : 0.05,
          shadowRadius: active ? 8 : 4,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Text style={[font.bodyBold, { color: active ? '#fff' : colors.textSecondary, fontSize: 14 }]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
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
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, { flex: 1, minWidth: 140 }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withTiming(0.96, { duration: 100 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}
        disabled={disabled}
        accessibilityRole="button"
        style={{
          minHeight: 56,
          borderRadius: radius.full,
          backgroundColor: colors.accent,
          opacity: disabled ? 0.55 : 1,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          shadowColor: colors.accent,
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        {icon}
        <Text style={[font.bodyBold, { color: '#fff', fontSize: 16 }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, radius, font } = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, { flex: 1, minWidth: 140 }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withTiming(0.96, { duration: 100 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}
        accessibilityRole="button"
        style={{
          minHeight: 56,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.isDark ? '#3F3F46' : '#E5E5EA',
          backgroundColor: colors.isDark ? '#18181B' : '#FFFFFF',
          paddingHorizontal: 20,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 16 }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}
