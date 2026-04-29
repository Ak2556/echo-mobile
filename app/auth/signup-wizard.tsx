import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, Dimensions, Platform,
  KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  withRepeat, withSequence, withDecay,
} from 'react-native-reanimated';
import { ArrowLeft, Check, At } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ACCENT = '#6366F1';
const SPRING = { damping: 24, stiffness: 300 };

const AVATAR_COLORS = [
  '#6366F1', '#EC4899', '#10B981', '#F59E0B',
  '#3B82F6', '#8B5CF6', '#EF4444', '#06B6D4',
  '#84CC16', '#F97316', '#14B8A6', '#A78BFA',
  '#FB923C', '#4ADE80', '#F472B6', '#38BDF8',
];

const INTERESTS = [
  { id: 'music', label: '🎵 Music' }, { id: 'gaming', label: '🎮 Gaming' },
  { id: 'art', label: '🎨 Art' }, { id: 'tech', label: '📱 Tech' },
  { id: 'fitness', label: '🏋️ Fitness' }, { id: 'food', label: '🍕 Food' },
  { id: 'travel', label: '✈️ Travel' }, { id: 'books', label: '📚 Books' },
  { id: 'film', label: '🎬 Film' }, { id: 'sports', label: '🏀 Sports' },
  { id: 'coding', label: '💻 Coding' }, { id: 'nature', label: '🌿 Nature' },
  { id: 'photography', label: '📸 Photography' }, { id: 'comedy', label: '😂 Comedy' },
  { id: 'science', label: '🔬 Science' }, { id: 'finance', label: '💰 Finance' },
  { id: 'culture', label: '🎭 Culture' }, { id: 'design', label: '🏠 Design' },
  { id: 'podcasts', label: '🎤 Podcasts' }, { id: 'writing', label: '✍️ Writing' },
];

const CONFETTI_COLORS = [ACCENT, '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#06B6D4', '#F97316'];

// Pre-generated at module level so values are stable across renders
const CONFETTI_DATA = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  startX: Math.random() * SCREEN_WIDTH,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  velocity: 300 + Math.random() * 400,
  xDrift: (Math.random() - 0.5) * 80,
  rotDeg: (Math.random() - 0.5) * 720,
  w: Math.round(5 + Math.random() * 7),
  h: Math.round(7 + Math.random() * 9),
}));

// ─── SwatchItem ───────────────────────────────────────────────────────────────

function SwatchItem({ color, selected, onPress }: {
  color: string; selected: boolean; onPress: () => void;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(selected ? 1.08 : 1, { damping: 18, stiffness: 400 });
  }, [selected]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      scaleValue={1}
      haptic="light"
      style={{ padding: 4 }}
      accessibilityRole="radio"
      accessibilityLabel={color}
      accessibilityState={{ checked: selected }}
    >
      <Animated.View style={[{
        width: 52, height: 52, borderRadius: 14,
        backgroundColor: color,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: selected ? 3 : 0,
        borderColor: 'rgba(255,255,255,0.9)',
      }, animStyle]}>
        {selected && <Check color="#fff" size={20} weight="bold" />}
      </Animated.View>
    </AnimatedPressable>
  );
}

// ─── InterestChip ─────────────────────────────────────────────────────────────

function InterestChip({ label, selected, onPress }: {
  label: string; selected: boolean; onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.92, { damping: 20, stiffness: 400 }),
      withSpring(1, { damping: 15, stiffness: 300 }),
    );
    onPress();
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={handlePress}
      scaleValue={1}
      haptic="light"
      style={{ margin: 4 }}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
    >
      <Animated.View style={[{
        paddingHorizontal: 14, paddingVertical: 9,
        borderRadius: 20,
        backgroundColor: selected ? ACCENT : '#18181B',
        borderWidth: 1,
        borderColor: selected ? ACCENT : '#3F3F46',
      }, animStyle]}>
        <Text style={{ color: selected ? '#fff' : '#A1A1AA', fontWeight: '600', fontSize: 14 }}>
          {label}
        </Text>
      </Animated.View>
    </AnimatedPressable>
  );
}

// ─── ConfettiPiece ────────────────────────────────────────────────────────────

function ConfettiPiece({ startX, color, velocity, xDrift, rotDeg, w, h }: {
  startX: number; color: string; velocity: number;
  xDrift: number; rotDeg: number; w: number; h: number;
}) {
  const ty = useSharedValue(0);
  const tx = useSharedValue(0);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    ty.value = withDecay({ velocity, deceleration: 0.998 });
    tx.value = withTiming(xDrift, { duration: 2800 });
    rot.value = withTiming(rotDeg, { duration: 2800 });
    opacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(0, { duration: 2600 }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: ty.value },
      { translateX: tx.value },
      { rotate: `${rot.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[{
      position: 'absolute',
      top: 50,
      left: startX,
      width: w,
      height: h,
      borderRadius: 2,
      backgroundColor: color,
    }, style]} />
  );
}

// ─── SignupWizard ─────────────────────────────────────────────────────────────

export default function SignupWizard() {
  const router = useRouter();
  const {
    setUsername,
    setDisplayName: storeSetDisplayName,
    setBio: storeSetBio,
    setAvatarColor: storeSetAvatarColor,
    setInterests,
    setHasSeenOnboarding,
    reduceAnimations,
  } = useAppStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [displayName, setDisplayNameLocal] = useState('');
  const [usernameRaw, setUsernameRaw] = useState('');
  const [avatarColor, setAvatarColorLocal] = useState(ACCENT);
  const [bioText, setBioText] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const usernameClean = usernameRaw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const firstName = displayName.trim().split(' ')[0] || 'you';
  const canStep0 = displayName.trim().length >= 1 && usernameClean.length >= 2;

  const nameInputRef = useRef<TextInput>(null);
  const prevColorRef = useRef(avatarColor);

  // ── Shared values ──
  const tapeOffset = useSharedValue(0);
  const progressBarWidth = useSharedValue(0);
  const glowOpacity = useSharedValue(0.3);
  const ctaGlowOpacity = useSharedValue(0);
  const backOpacity = useSharedValue(0);
  const counterOpacity = useSharedValue(1);

  const tapeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tapeOffset.value }],
  }));

  const progressBarStyle = useAnimatedStyle(() => ({
    width: progressBarWidth.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const ctaGlowStyle = useAnimatedStyle(() => ({
    opacity: ctaGlowOpacity.value,
  }));

  const backOpacityStyle = useAnimatedStyle(() => ({
    opacity: backOpacity.value,
  }));

  const counterOpacityStyle = useAnimatedStyle(() => ({
    opacity: counterOpacity.value,
  }));

  // Progress bar follows currentStep
  useEffect(() => {
    progressBarWidth.value = withSpring((currentStep / 4) * SCREEN_WIDTH, SPRING);
  }, [currentStep]);

  // CTA glow pulse on step 4
  useEffect(() => {
    if (currentStep === 4) {
      ctaGlowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 1000 }),
          withTiming(0.3, { duration: 1000 }),
        ),
        -1,
        true,
      );
    }
  }, [currentStep]);

  // Auto-focus name input when on step 0
  useEffect(() => {
    if (currentStep === 0) {
      const t = setTimeout(() => nameInputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  // Avatar glow pulse on color change
  useEffect(() => {
    if (prevColorRef.current !== avatarColor) {
      prevColorRef.current = avatarColor;
      glowOpacity.value = withSequence(
        withTiming(0.8, { duration: 150 }),
        withSpring(0.3, { damping: 15, stiffness: 200 }),
      );
    }
  }, [avatarColor]);

  const goToStep = useCallback((n: number, instant = false) => {
    setCurrentStep(n);
    const hidden = n === 0 || n === 4;
    backOpacity.value = withTiming(hidden ? 0 : 1, { duration: 200 });
    counterOpacity.value = withTiming(n === 4 ? 0 : 1, { duration: 200 });
    if (instant || reduceAnimations) {
      tapeOffset.value = -n * SCREEN_WIDTH;
    } else {
      tapeOffset.value = withSpring(-n * SCREEN_WIDTH, SPRING);
    }
  }, [reduceAnimations]);

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showToast('Session expired', '❌');
      router.replace('/auth/login');
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id: session.user.id,
      username: usernameClean,
      display_name: displayName.trim(),
      avatar_color: avatarColor,
      bio: bioText.trim() || null,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (error.code === '23505' || msg.includes('unique') || msg.includes('duplicate')) {
        showToast('Username taken — pick another', '❌');
        goToStep(0, true);
        setSaving(false);
        return;
      }
      showToast(error.message, '❌');
      setSaving(false);
      return;
    }

    storeSetDisplayName(displayName.trim());
    setUsername(usernameClean);
    storeSetAvatarColor(avatarColor);
    storeSetBio(bioText.trim());
    setInterests(selectedInterests);
    setHasSeenOnboarding(true);

    router.replace('/(tabs)/discover');
  };

  const backHidden = currentStep === 0 || currentStep === 4;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Progress bar */}
        <View style={{ height: 3, backgroundColor: '#18181B', width: '100%' }}>
          <Animated.View style={[{ height: 3, backgroundColor: ACCENT }, progressBarStyle]} />
        </View>

        {/* Chrome: back + step counter */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 14,
        }}>
          <Animated.View style={backOpacityStyle}>
            <AnimatedPressable
              onPress={() => goToStep(currentStep - 1)}
              disabled={backHidden}
              scaleValue={0.9}
              haptic="light"
              style={{ padding: 4 }}
            >
              <ArrowLeft color="#A1A1AA" size={22} />
            </AnimatedPressable>
          </Animated.View>

          <Animated.Text style={[{
            color: '#52525B', fontSize: 13, fontWeight: '600',
          }, counterOpacityStyle]}>
            Step {currentStep + 1} of 4
          </Animated.Text>

          <View style={{ width: 30 }} />
        </View>

        {/* Tape */}
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.View style={[{
            position: 'absolute',
            top: 0, bottom: 0, left: 0,
            width: SCREEN_WIDTH * 5,
            flexDirection: 'row',
          }, tapeStyle]}>

            {/* ── Step 0: Who are you? ── */}
            <View style={{ width: SCREEN_WIDTH, height: '100%', paddingHorizontal: 24 }}>
              <View style={{ flex: 1, paddingTop: 8 }}>
                <Text style={{
                  color: '#fff', fontSize: 28, fontWeight: '800',
                  letterSpacing: -0.5, marginBottom: 6,
                }}>
                  Who are you?
                </Text>
                <Text style={{ color: '#52525B', fontSize: 15, marginBottom: 32 }}>
                  Tell us your name and choose a handle.
                </Text>

                <Text style={{
                  color: '#A1A1AA', fontSize: 12, fontWeight: '700',
                  letterSpacing: 0.8, marginBottom: 8,
                }}>
                  DISPLAY NAME
                </Text>
                <TextInput
                  ref={nameInputRef}
                  value={displayName}
                  onChangeText={setDisplayNameLocal}
                  placeholder="Your name"
                  placeholderTextColor="#3F3F46"
                  returnKeyType="next"
                  style={{
                    fontSize: 20, color: '#fff', fontWeight: '600',
                    backgroundColor: '#18181B',
                    borderRadius: 14, borderWidth: 1,
                    borderColor: displayName ? '#3F3F46' : '#27272A',
                    paddingHorizontal: 16, paddingVertical: 14,
                    marginBottom: 20,
                  }}
                />

                <Text style={{
                  color: '#A1A1AA', fontSize: 12, fontWeight: '700',
                  letterSpacing: 0.8, marginBottom: 8,
                }}>
                  USERNAME
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1,
                  borderColor: usernameRaw ? '#3F3F46' : '#27272A',
                  paddingHorizontal: 14, marginBottom: 8,
                }}>
                  <At color="#52525B" size={18} style={{ marginRight: 8 }} />
                  <TextInput
                    value={usernameRaw}
                    onChangeText={setUsernameRaw}
                    placeholder="username"
                    placeholderTextColor="#3F3F46"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    style={{
                      flex: 1, fontSize: 16, color: '#fff',
                      paddingVertical: 14,
                    }}
                  />
                </View>
                {usernameClean.length > 0 && (
                  <>
                    <Text style={{ color: '#52525B', fontSize: 13, marginLeft: 2 }}>
                      @{usernameClean}
                    </Text>
                    {usernameRaw !== usernameClean && (
                      <Text style={{ color: '#3F3F46', fontSize: 12, marginLeft: 2, marginTop: 3 }}>
                        letters, numbers & _ only
                      </Text>
                    )}
                  </>
                )}
              </View>

              <View style={{ paddingBottom: 16 }}>
                <AnimatedPressable
                  onPress={() => canStep0 && goToStep(1)}
                  disabled={!canStep0}
                  scaleValue={0.97}
                  haptic="medium"
                  style={{
                    backgroundColor: canStep0 ? ACCENT : '#27272A',
                    borderRadius: 14, paddingVertical: 16,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: canStep0 ? 1 : 0.5,
                    shadowColor: ACCENT,
                    shadowOpacity: canStep0 ? 0.4 : 0,
                    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Continue</Text>
                </AnimatedPressable>
              </View>
            </View>

            {/* ── Step 1: Make it yours ── */}
            <View style={{ width: SCREEN_WIDTH, height: '100%', paddingHorizontal: 24 }}>
              <View style={{ flex: 1, paddingTop: 8 }}>
                <Text style={{
                  color: '#fff', fontSize: 28, fontWeight: '800',
                  letterSpacing: -0.5, marginBottom: 6,
                }}>
                  Make it yours
                </Text>
                <Text style={{ color: '#52525B', fontSize: 15, marginBottom: 28 }}>
                  Pick a color that represents you.
                </Text>

                {/* Avatar preview with glow */}
                <View style={{ alignItems: 'center', marginBottom: 28 }}>
                  <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
                    <Animated.View style={[{
                      position: 'absolute',
                      top: -8, left: -8, right: -8, bottom: -8,
                      borderRadius: 68,
                      backgroundColor: avatarColor,
                    }, glowStyle]} />
                    <View style={{
                      width: 100, height: 100, borderRadius: 50,
                      backgroundColor: avatarColor,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800' }}>
                        {displayName ? displayName[0].toUpperCase() : '?'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Color grid — 4 columns */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {AVATAR_COLORS.map(color => (
                    <SwatchItem
                      key={color}
                      color={color}
                      selected={avatarColor === color}
                      onPress={() => setAvatarColorLocal(color)}
                    />
                  ))}
                </View>
              </View>

              <View style={{ paddingBottom: 16 }}>
                <AnimatedPressable
                  onPress={() => goToStep(2)}
                  scaleValue={0.97}
                  haptic="medium"
                  style={{
                    backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 16,
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: ACCENT, shadowOpacity: 0.4,
                    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Continue</Text>
                </AnimatedPressable>
              </View>
            </View>

            {/* ── Step 2: Your story ── */}
            <View style={{ width: SCREEN_WIDTH, height: '100%', paddingHorizontal: 24 }}>
              <View style={{ flex: 1, paddingTop: 8 }}>
                <Text style={{
                  color: '#fff', fontSize: 28, fontWeight: '800',
                  letterSpacing: -0.5, marginBottom: 6,
                }}>
                  Your story
                </Text>
                <Text style={{ color: '#52525B', fontSize: 15, marginBottom: 24 }}>
                  Tell the world a little about yourself.
                </Text>

                <View style={{
                  backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1,
                  borderColor: '#27272A', padding: 16, marginBottom: 6,
                }}>
                  <TextInput
                    value={bioText}
                    onChangeText={setBioText}
                    placeholder="What's on your mind?"
                    placeholderTextColor="#3F3F46"
                    multiline
                    maxLength={150}
                    textAlignVertical="top"
                    style={{
                      color: '#fff', fontSize: 16, lineHeight: 24,
                      minHeight: 100, maxHeight: 160,
                    }}
                  />
                </View>
                <Text style={{
                  color: bioText.length >= 100 ? ACCENT : '#52525B',
                  fontSize: 12, textAlign: 'right',
                }}>
                  {bioText.length}/150
                </Text>
              </View>

              <View style={{ paddingBottom: 16, gap: 12 }}>
                <AnimatedPressable
                  onPress={() => goToStep(3)}
                  scaleValue={0.97}
                  haptic="medium"
                  style={{
                    backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 16,
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: ACCENT, shadowOpacity: 0.4,
                    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Continue</Text>
                </AnimatedPressable>

                <AnimatedPressable
                  onPress={() => goToStep(3)}
                  scaleValue={0.97}
                  haptic="light"
                  style={{ alignItems: 'center', paddingVertical: 8 }}
                >
                  <Text style={{ color: '#52525B', fontSize: 14, fontWeight: '600' }}>Skip for now</Text>
                </AnimatedPressable>
              </View>
            </View>

            {/* ── Step 3: What lights you up? ── */}
            <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
              <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
                <Text style={{
                  color: '#fff', fontSize: 28, fontWeight: '800',
                  letterSpacing: -0.5, marginBottom: 6,
                }}>
                  What lights you up?
                </Text>
                <Text style={{ color: '#52525B', fontSize: 15, marginBottom: 4 }}>
                  Pick topics that interest you.
                </Text>
                <Text style={{
                  color: selectedInterests.length >= 3 ? ACCENT : '#52525B',
                  fontSize: 13, fontWeight: '600', marginBottom: 14,
                }}>
                  {selectedInterests.length} selected
                  {selectedInterests.length < 3 ? ' · pick at least 3' : ''}
                </Text>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {INTERESTS.map(i => (
                    <InterestChip
                      key={i.id}
                      label={i.label}
                      selected={selectedInterests.includes(i.id)}
                      onPress={() => toggleInterest(i.id)}
                    />
                  ))}
                </View>
              </ScrollView>

              <View style={{ paddingHorizontal: 24, paddingBottom: 16, gap: 12 }}>
                <AnimatedPressable
                  onPress={() => {
                    if (selectedInterests.length < 3) {
                      showToast(`Pick ${3 - selectedInterests.length} more to continue`, '👆');
                    } else {
                      goToStep(4);
                    }
                  }}
                  scaleValue={0.97}
                  haptic="medium"
                  style={{
                    backgroundColor: selectedInterests.length >= 3 ? ACCENT : '#27272A',
                    borderRadius: 14, paddingVertical: 16,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: selectedInterests.length >= 3 ? 1 : 0.5,
                    shadowColor: ACCENT,
                    shadowOpacity: selectedInterests.length >= 3 ? 0.4 : 0,
                    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Continue</Text>
                </AnimatedPressable>

                <AnimatedPressable
                  onPress={() => goToStep(4)}
                  scaleValue={0.97}
                  haptic="light"
                  style={{ alignItems: 'center', paddingVertical: 8 }}
                >
                  <Text style={{ color: '#52525B', fontSize: 14, fontWeight: '600' }}>Skip</Text>
                </AnimatedPressable>
              </View>
            </View>

            {/* ── Step 4: Celebration ── */}
            <View style={{
              width: SCREEN_WIDTH, height: '100%',
              paddingHorizontal: 24, alignItems: 'center',
            }}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: 120, height: 120, borderRadius: 60,
                  backgroundColor: avatarColor,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: 24,
                  shadowColor: avatarColor, shadowOpacity: 0.6,
                  shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
                }}>
                  <Text style={{ color: '#fff', fontSize: 48, fontWeight: '800' }}>
                    {displayName ? displayName[0].toUpperCase() : '?'}
                  </Text>
                </View>

                <Text style={{
                  color: '#fff', fontSize: 26, fontWeight: '800',
                  letterSpacing: -0.5, textAlign: 'center', marginBottom: 10,
                }}>
                  Welcome to Echo, {firstName}!
                </Text>
                <Text style={{
                  color: '#52525B', fontSize: 15, textAlign: 'center',
                  lineHeight: 22,
                }}>
                  Your profile is ready. Time to explore.
                </Text>
              </View>

              <View style={{ width: '100%', paddingBottom: 16 }}>
                <View style={{ position: 'relative' }}>
                  <Animated.View style={[{
                    position: 'absolute',
                    top: -8, left: -8, right: -8, bottom: -8,
                    borderRadius: 22,
                    backgroundColor: ACCENT,
                  }, ctaGlowStyle]} />
                  <AnimatedPressable
                    onPress={handleSave}
                    disabled={saving}
                    scaleValue={0.97}
                    haptic="medium"
                    style={{
                      backgroundColor: ACCENT,
                      borderRadius: 14, paddingVertical: 16,
                      alignItems: 'center', justifyContent: 'center',
                      shadowColor: ACCENT, shadowOpacity: 0.5,
                      shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
                    }}
                  >
                    {saving
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Start exploring</Text>}
                  </AnimatedPressable>
                </View>
              </View>
            </View>

          </Animated.View>
        </View>

        {/* Confetti overlay — only on step 4, skipped when reduceAnimations */}
        {!reduceAnimations && currentStep === 4 && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          >
            {CONFETTI_DATA.map(c => (
              <ConfettiPiece key={c.id} {...c} />
            ))}
          </View>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
