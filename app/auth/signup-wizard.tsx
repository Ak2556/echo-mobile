import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, Platform, useWindowDimensions,
  KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  withRepeat, withSequence, withDecay,
} from 'react-native-reanimated';
import { ArrowLeft, Check, At, Brain } from 'phosphor-react-native';
import { ARCHETYPE_QUESTIONS, ARCHETYPES, ThinkingArchetype, scoreArchetype } from '../../lib/thinkingArchetype';
import { supabase } from '../../lib/supabase';
import { refreshAuthSession, useAuth } from '../../lib/auth';
import { useAppStore } from '../../store/useAppStore';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { track, identify } from '../../lib/analytics';
import { useResponsiveLayout } from '../../lib/responsive';
import { WARM_AVATAR_COLORS } from '../../lib/avatarPalette';

const ACCENT = '#E06030';
const SPRING = { damping: 24, stiffness: 300 };

// Warm editorial identity palette — single source: lib/avatarPalette.ts.
const AVATAR_COLORS = [...WARM_AVATAR_COLORS];

const INTERESTS = [
  // thinking & knowledge
  { id: 'philosophy', label: 'Philosophy' }, { id: 'science', label: 'Science' },
  { id: 'psychology', label: 'Psychology' }, { id: 'economics', label: 'Economics' },
  { id: 'history', label: 'History' }, { id: 'politics', label: 'Politics' },
  // creative & culture
  { id: 'writing', label: 'Writing' }, { id: 'art', label: 'Art' },
  { id: 'film', label: 'Film' }, { id: 'music', label: 'Music' },
  { id: 'books', label: 'Books' }, { id: 'design', label: 'Design' },
  // world & society
  { id: 'technology', label: 'Technology' }, { id: 'startups', label: 'Startups' },
  { id: 'climate', label: 'Climate' }, { id: 'education', label: 'Education' },
  { id: 'culture', label: 'Culture' }, { id: 'media', label: 'Media' },
  // life & wellbeing
  { id: 'health', label: 'Health' }, { id: 'mental-health', label: 'Mental Health' },
  { id: 'fitness', label: 'Fitness' }, { id: 'spirituality', label: 'Spirituality' },
  { id: 'nature', label: 'Nature' },
  // everyday life
  { id: 'career', label: 'Career' }, { id: 'finance', label: 'Finance' },
  { id: 'relationships', label: 'Relationships' }, { id: 'parenting', label: 'Parenting' },
  { id: 'travel', label: 'Travel' }, { id: 'food', label: 'Food' },
  // fun & play
  { id: 'gaming', label: 'Gaming' }, { id: 'sports', label: 'Sports' },
  { id: 'fashion', label: 'Fashion' },
];

const CONFETTI_COLORS = [ACCENT, '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#06B6D4', '#F97316'];

function SwatchItem({ color, selected, onPress }: {
  color: string; selected: boolean; onPress: () => void;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(selected ? 1.08 : 1, { damping: 18, stiffness: 400 });
  }, [selected, scale]);

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

export default function SignupWizard() {
  const router = useRouter();
  const { session } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const layout = useResponsiveLayout();
  const stepWidth = Math.min(screenWidth, layout.contentMaxWidth);
  const confettiData = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    id: i,
    startX: Math.random() * stepWidth,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    velocity: 300 + Math.random() * 400,
    xDrift: (Math.random() - 0.5) * 80,
    rotDeg: (Math.random() - 0.5) * 720,
    w: Math.round(5 + Math.random() * 7),
    h: Math.round(7 + Math.random() * 9),
  })), [stepWidth]);
  const {
    setUsername,
    setDisplayName: storeSetDisplayName,
    setBio: storeSetBio,
    setAvatarColor: storeSetAvatarColor,
    setInterests,
    setThinkingStyle,
    setHasSeenOnboarding,
    setHasCompletedProductOnboarding,
    setOnboardingDraftCreated,
    reduceAnimations,
  } = useAppStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [displayName, setDisplayNameLocal] = useState('');
  const [usernameRaw, setUsernameRaw] = useState('');

  useEffect(() => { track('signup_started'); }, []);
  const [avatarColor, setAvatarColorLocal] = useState(ACCENT);
  const [bioText, setBioText] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [archetypeAnswers, setArchetypeAnswers] = useState<Record<string, ThinkingArchetype>>({});
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const usernameClean = usernameRaw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const firstName = displayName.trim().split(' ')[0] || 'you';
  const canStep0 =
    displayName.trim().length >= 1 &&
    usernameClean.length >= 3 &&
    usernameStatus !== 'taken' &&
    usernameStatus !== 'checking';

  useEffect(() => {
    if (usernameClean.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    const controller = new AbortController();

    const debounce = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', usernameClean)
          .abortSignal(controller.signal)
          .maybeSingle();
        if (controller.signal.aborted) return;
        if (error) {
          setUsernameStatus('idle');
          return;
        }
        setUsernameStatus(data ? 'taken' : 'available');
      } catch {
        if (!controller.signal.aborted) setUsernameStatus('idle');
      }
    }, 300);

    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [usernameClean]);

  const nameInputRef = useRef<TextInput>(null);
  const prevColorRef = useRef(avatarColor);

  const tapeOffset = useSharedValue(0);
  const progressBarWidth = useSharedValue(0);
  const avatarRingOpacity = useSharedValue(0.3);
  const ctaRingOpacity = useSharedValue(0);
  const backOpacity = useSharedValue(0);
  const counterOpacity = useSharedValue(1);

  const tapeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tapeOffset.value }],
  }));

  const progressBarStyle = useAnimatedStyle(() => ({
    width: progressBarWidth.value,
  }));

  const avatarRingStyle = useAnimatedStyle(() => ({
    opacity: avatarRingOpacity.value,
  }));

  const ctaRingStyle = useAnimatedStyle(() => ({
    opacity: ctaRingOpacity.value,
  }));

  const backOpacityStyle = useAnimatedStyle(() => ({
    opacity: backOpacity.value,
  }));

  const counterOpacityStyle = useAnimatedStyle(() => ({
    opacity: counterOpacity.value,
  }));

  useEffect(() => {
    progressBarWidth.value = withSpring((currentStep / 5) * screenWidth, SPRING);
  }, [currentStep, progressBarWidth, screenWidth]);

  useEffect(() => {
    if (currentStep === 5) {
      ctaRingOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 1000 }),
          withTiming(0.3, { duration: 1000 }),
        ),
        -1,
        true,
      );
    }
  }, [currentStep, ctaRingOpacity]);

  useEffect(() => {
    if (currentStep === 0) {
      const t = setTimeout(() => nameInputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  useEffect(() => {
    if (prevColorRef.current !== avatarColor) {
      prevColorRef.current = avatarColor;
      avatarRingOpacity.value = withSequence(
        withTiming(0.8, { duration: 150 }),
        withSpring(0.3, { damping: 15, stiffness: 200 }),
      );
    }
  }, [avatarColor, avatarRingOpacity]);

  const goToStep = useCallback((n: number, instant = false) => {
    setCurrentStep(n);
    const hidden = n === 0 || n === 4;
    backOpacity.value = withTiming(hidden ? 0 : 1, { duration: 200 });
    counterOpacity.value = withTiming(n === 4 ? 0 : 1, { duration: 200 });
    if (instant || reduceAnimations) {
      tapeOffset.value = -n * stepWidth;
    } else {
      tapeOffset.value = withSpring(-n * stepWidth, SPRING);
    }
  }, [reduceAnimations, backOpacity, counterOpacity, stepWidth, tapeOffset]);

  useEffect(() => {
    tapeOffset.value = -currentStep * stepWidth;
  }, [currentStep, stepWidth, tapeOffset]);

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (saving) return;
    if (!session) {
      showToast('Session expired', 'Error');
      router.replace('/auth/login');
      return;
    }
    setSaving(true);

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
        showToast('Username taken — pick another', 'Error');
        setUsernameRaw('');
        goToStep(0, true);
        setSaving(false);
        return;
      }
      showToast(error.message, 'Error');
      setSaving(false);
      return;
    }

    storeSetDisplayName(displayName.trim());
    setUsername(usernameClean);
    storeSetAvatarColor(avatarColor);
    storeSetBio(bioText.trim());
    setInterests(selectedInterests);
    if (Object.keys(archetypeAnswers).length > 0) {
      setThinkingStyle(scoreArchetype(archetypeAnswers));
    }
    setHasSeenOnboarding(true);
    setHasCompletedProductOnboarding(false);
    setOnboardingDraftCreated(false);

    identify(session.user.id, { username: usernameClean });
    track('signup_completed', { interests_count: selectedInterests.length });

    await refreshAuthSession();
    router.replace('/onboarding');
  };

  const backHidden = currentStep === 0 || currentStep === 5;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ height: 3, backgroundColor: '#18181B', width: '100%' }}>
          <Animated.View style={[{ height: 3, backgroundColor: ACCENT }, progressBarStyle]} />
        </View>

        <View style={[layout.contentStyle, {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 14,
        }]}>
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
            Step {currentStep + 1} of 5
          </Animated.Text>

          <View style={{ width: 30 }} />
        </View>

        <View style={[layout.contentStyle, { flex: 1, overflow: 'hidden' }]}>
          <Animated.View style={[{
            position: 'absolute',
            top: 0, bottom: 0, left: 0,
            width: stepWidth * 6,
            flexDirection: 'row',
          }, tapeStyle]}>

            <View style={{ width: stepWidth, height: '100%', paddingHorizontal: 24 }}>
              <View style={{ flex: 1, paddingTop: 8 }}>
                <Text style={{
                  color: '#fff', fontSize: 28, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5,
                  marginBottom: 6,
                }}>
                  Welcome to Echo
                </Text>
                <Text style={{ color: '#52525B', fontSize: 15, marginBottom: 32 }}>
                  The social network for thinking out loud. Let&apos;s set up your account.
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
                  borderColor:
                    usernameStatus === 'taken' ? '#EF4444'
                    : usernameStatus === 'available' ? '#22C55E'
                    : usernameRaw ? '#3F3F46' : '#27272A',
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
                  {usernameStatus === 'checking' && (
                    <ActivityIndicator color="#52525B" size="small" style={{ marginLeft: 8 }} />
                  )}
                  {usernameStatus === 'available' && (
                    <Check color="#22C55E" size={18} weight="bold" style={{ marginLeft: 8 }} />
                  )}
                </View>
                {usernameClean.length > 0 && (
                  <View style={{ marginLeft: 2, gap: 2 }}>
                    <Text style={{
                      color:
                        usernameStatus === 'taken' ? '#EF4444'
                        : usernameStatus === 'available' ? '#22C55E'
                        : '#52525B',
                      fontSize: 13,
                    }}>
                      {usernameStatus === 'taken'
                        ? `@${usernameClean} is taken`
                        : usernameStatus === 'available'
                          ? `@${usernameClean} is yours`
                          : `@${usernameClean}`}
                    </Text>
                    {usernameClean.length < 3 && (
                      <Text style={{ color: '#3F3F46', fontSize: 12 }}>
                        At least 3 characters
                      </Text>
                    )}
                    {usernameRaw !== usernameClean && (
                      <Text style={{ color: '#3F3F46', fontSize: 12 }}>
                        letters, numbers & _ only
                      </Text>
                    )}
                  </View>
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

            <View style={{ width: stepWidth, height: '100%', paddingHorizontal: 24 }}>
              <View style={{ flex: 1, paddingTop: 8 }}>
                <Text style={{
                  color: '#fff', fontSize: 28, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5,
                  marginBottom: 6,
                }}>
                  Make it yours
                </Text>
                <Text style={{ color: '#52525B', fontSize: 15, marginBottom: 28 }}>
                  Pick a color that represents you.
                </Text>

                <View style={{ alignItems: 'center', marginBottom: 28 }}>
                  <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
                    <Animated.View style={[{
                      position: 'absolute',
                      top: -8, left: -8, right: -8, bottom: -8,
                      borderRadius: 68,
                      backgroundColor: avatarColor,
                    }, avatarRingStyle]} />
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

            <View style={{ width: stepWidth, height: '100%', paddingHorizontal: 24 }}>
              <View style={{ flex: 1, paddingTop: 8 }}>
                <Text style={{
                  color: '#fff', fontSize: 28, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5,
                  marginBottom: 6,
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

            <View style={{ width: stepWidth, height: '100%' }}>
              <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
                <Text style={{
                  color: '#fff', fontSize: 28, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5,
                  marginBottom: 6,
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
                      showToast(`Pick ${3 - selectedInterests.length} more to continue`, 'More');
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
                  <Text style={{ color: '#52525B', fontSize: 14, fontWeight: '600' }}>Skip for now</Text>
                </AnimatedPressable>
              </View>
            </View>

            {/* Step 4: Thinking Archetype quiz */}
            <View style={{ width: stepWidth, height: '100%' }}>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Brain color={ACCENT} size={22} weight="fill" />
                  <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>THINKING ARCHETYPE</Text>
                </View>
                <Text style={{ color: '#fff', fontSize: 26, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5, marginBottom: 6 }}>
                  How do you think?
                </Text>
                <Text style={{ color: '#52525B', fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
                  3 quick questions to find your intellectual style. It shapes how Echo introduces you.
                </Text>
                {ARCHETYPE_QUESTIONS.map((q, qi) => (
                  <View key={q.id} style={{ marginBottom: 22 }}>
                    <Text style={{ color: '#A1A1AA', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 }}>
                      {qi + 1} of {ARCHETYPE_QUESTIONS.length}
                    </Text>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 22, marginBottom: 10 }}>
                      {q.question}
                    </Text>
                    {q.options.map((opt) => {
                      const selected = archetypeAnswers[q.id] === opt.archetype;
                      const info = ARCHETYPES[opt.archetype];
                      return (
                        <AnimatedPressable
                          key={opt.archetype}
                          onPress={() => setArchetypeAnswers(prev => ({ ...prev, [q.id]: opt.archetype }))}
                          scaleValue={0.97}
                          haptic="light"
                          style={{
                            marginBottom: 8,
                            borderRadius: 12,
                            borderWidth: 1.5,
                            borderColor: selected ? info.color : '#27272A',
                            backgroundColor: selected ? info.dimColor : '#18181B',
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                          }}
                        >
                          <Text style={{ color: selected ? info.color : '#A1A1AA', fontSize: 14, fontWeight: selected ? '700' : '500', lineHeight: 20 }}>
                            {opt.label}
                          </Text>
                        </AnimatedPressable>
                      );
                    })}
                  </View>
                ))}
                {/* Preview archetype if all answered */}
                {Object.keys(archetypeAnswers).length === ARCHETYPE_QUESTIONS.length && (() => {
                  const archetype = ARCHETYPES[scoreArchetype(archetypeAnswers)];
                  return (
                    <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: archetype.color + '66', backgroundColor: archetype.dimColor, padding: 16, marginBottom: 16 }}>
                      <Text style={{ color: archetype.color, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 }}>YOUR ARCHETYPE</Text>
                      <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800', marginBottom: 4 }}>{archetype.label}</Text>
                      <Text style={{ color: '#A1A1AA', fontSize: 13, lineHeight: 19 }}>{archetype.description}</Text>
                    </View>
                  );
                })()}
              </ScrollView>
              <View style={{ paddingHorizontal: 24, paddingBottom: 16, gap: 12 }}>
                <AnimatedPressable
                  onPress={() => goToStep(5)}
                  scaleValue={0.97}
                  haptic="medium"
                  style={{
                    backgroundColor: Object.keys(archetypeAnswers).length === ARCHETYPE_QUESTIONS.length ? ACCENT : '#27272A',
                    borderRadius: 14, paddingVertical: 16,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: Object.keys(archetypeAnswers).length === ARCHETYPE_QUESTIONS.length ? 1 : 0.5,
                    shadowColor: ACCENT,
                    shadowOpacity: Object.keys(archetypeAnswers).length === ARCHETYPE_QUESTIONS.length ? 0.4 : 0,
                    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                    {Object.keys(archetypeAnswers).length === ARCHETYPE_QUESTIONS.length ? 'Continue' : `${ARCHETYPE_QUESTIONS.length - Object.keys(archetypeAnswers).length} questions left`}
                  </Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => goToStep(5)}
                  scaleValue={0.97}
                  haptic="light"
                  style={{ alignItems: 'center', paddingVertical: 8 }}
                >
                  <Text style={{ color: '#52525B', fontSize: 14, fontWeight: '600' }}>Skip</Text>
                </AnimatedPressable>
              </View>
            </View>

            {/* Step 5: Confirmation */}
            <View style={{
              width: stepWidth, height: '100%',
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
                  Your profile is ready. Next, make your first Echo.
                </Text>
              </View>

              <View style={{ width: '100%', paddingBottom: 16 }}>
                <View style={{ position: 'relative' }}>
                  <Animated.View style={[{
                    position: 'absolute',
                    top: -8, left: -8, right: -8, bottom: -8,
                    borderRadius: 22,
                    backgroundColor: ACCENT,
                  }, ctaRingStyle]} />
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
                      : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Continue</Text>}
                  </AnimatedPressable>
                </View>
              </View>
            </View>

          </Animated.View>
        </View>

        {!reduceAnimations && currentStep === 5 && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          >
            {confettiData.map(c => (
              <ConfettiPiece key={c.id} {...c} />
            ))}
          </View>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
