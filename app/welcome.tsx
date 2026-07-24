import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { ChatCircleText, UsersThree, Target, ArrowRight, Sparkle, Flame } from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { DailyQuestionComposer } from '../components/daily/DailyQuestionComposer';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import {
  fetchTodaysDailyQuestion,
  fetchDailyAnswerStreak,
  type DailyQuestion,
} from '../lib/supabaseEchoApi';
import { getFirstRunFallbackQuestion } from '../lib/firstRunQuestion';
import { track } from '../lib/analytics';
import { useI18n } from '../lib/i18n';

/**
 * First-run value moment.
 *
 * Instead of the old abstract "build your target system" setup, a brand-new
 * user lands here and does one meaningful thing in ~10 seconds — answer today's
 * question. Only after that do we reveal what Echo is (the three doors:
 * community, AI, ritual/goals). Value first, depth on demand.
 *
 * Reached from the sign-up wizard once the profile exists. One-time, guarded by
 * `hasCompletedFirstRun`.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, fontSizes, font } = useTheme();
  const { t } = useI18n();
  const hasCompletedFirstRun = useAppStore(s => s.hasCompletedFirstRun);
  const setHasCompletedFirstRun = useAppStore(s => s.setHasCompletedFirstRun);

  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [persistAnswer, setPersistAnswer] = useState(true);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'answer' | 'reveal'>('answer');
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Returning users should never see the value moment again. Snapshot the flag
  // at mount: answering flips it true mid-session to reveal the doors, and we
  // must NOT redirect on that — only on users who *arrive* already-completed.
  const arrivedCompleted = useRef(hasCompletedFirstRun);
  useEffect(() => {
    if (arrivedCompleted.current) router.replace('/(tabs)/home');
  }, [router]);

  useEffect(() => {
    void (async () => {
      try {
        const q = await fetchTodaysDailyQuestion().catch(() => null);
        if (!mounted.current) return;
        if (q) {
          setQuestion(q);
          setPersistAnswer(true);
        } else {
          // Never dead-end the aha — fall back to a local prompt (not persisted).
          setQuestion(getFirstRunFallbackQuestion());
          setPersistAnswer(false);
        }
        fetchDailyAnswerStreak().then(s => { if (mounted.current) setStreak(s); }).catch(() => {});
        track('first_run_started');
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
  }, []);

  const finish = (dest: string) => {
    setHasCompletedFirstRun(true);
    router.replace(dest as never);
  };

  const handleAnswered = () => {
    setHasCompletedFirstRun(true);
    track('first_run_answered', { persisted: persistAnswer });
    if (persistAnswer) setStreak(s => (s > 0 ? s : 1));
    setPhase('reveal');
  };

  if (loading || !question) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {phase === 'answer' ? (
            <>
              <Animated.View entering={FadeIn.duration(240)} style={{ marginTop: 8, marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Sparkle color={colors.accent} size={22} weight="fill" />
                  <Text style={[font.eyebrow, { color: colors.textMuted }]}>{t('welcome.eyebrow')}</Text>
                </View>
                <Text style={[font.display, { color: colors.text, fontSize: 30, lineHeight: 36, letterSpacing: -0.4 }]}>
                  {t('welcome.startTitle')}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 23, marginTop: 10 }}>
                  {t('welcome.startBody')}
                </Text>
              </Animated.View>

              <DailyQuestionComposer
                question={question}
                streak={streak}
                persist={persistAnswer}
                onSubmitted={handleAnswered}
                submitFirstLabel={t('welcome.shareTake')}
              />

              <AnimatedPressable
                onPress={() => finish('/(tabs)/home')}
                haptic="light"
                style={{ alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20 }}
              >
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, fontWeight: '600' }}>
                  {t('welcome.skipNow')}
                </Text>
              </AnimatedPressable>
            </>
          ) : (
            <RevealDoors
              streak={persistAnswer ? streak : 0}
              onEnter={() => finish('/(tabs)/home')}
              onDoor={(dest) => finish(dest)}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RevealDoors({
  streak, onEnter, onDoor,
}: {
  streak: number;
  onEnter: () => void;
  onDoor: (dest: string) => void;
}) {
  const { colors, radius, font, fontSizes } = useTheme();
  const { t } = useI18n();

  const doors: { icon: React.ReactNode; title: string; body: string; dest: string; tint: string }[] = [
    {
      icon: <UsersThree color="#4E7A8B" size={22} weight="fill" />,
      title: t('welcome.seeAnswers'),
      body: t('welcome.seeAnswersBody'),
      dest: '/daily-question',
      tint: '#4E7A8B',
    },
    {
      icon: <ChatCircleText color="#A04E4E" size={22} weight="fill" />,
      title: t('welcome.goDeeper'),
      body: t('welcome.goDeeperBody'),
      dest: '/(tabs)/chat',
      tint: '#A04E4E',
    },
    {
      icon: <Target color="#7A8B4E" size={22} weight="fill" />,
      title: t('welcome.setGoal'),
      body: t('welcome.setGoalBody'),
      dest: '/onboarding',
      tint: '#7A8B4E',
    },
  ];

  return (
    <Animated.View entering={FadeIn.duration(260)} style={{ marginTop: 8 }}>
      <View style={{ alignItems: 'center', marginBottom: 8 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: colors.accent + '1A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99,
        }}>
          <Flame color={colors.accent} size={15} weight="fill" />
          <Text style={{ color: colors.accent, fontSize: fontSizes.small, fontWeight: '800' }}>
            {streak > 0 ? t('welcome.streakStarted', { count: streak }) : t('welcome.takeIn')}
          </Text>
        </View>
      </View>

      <Text style={[font.display, { color: colors.text, fontSize: 26, lineHeight: 32, letterSpacing: -0.3, textAlign: 'center', marginTop: 12 }]}>
        {t('welcome.thatsEcho')}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8, marginBottom: 22, paddingHorizontal: 8 }}>
        {t('welcome.revealBody')}
      </Text>

      {doors.map((d, i) => (
        <Animated.View key={d.dest} entering={FadeInUp.delay(80 + i * 70).duration(240)}>
          <AnimatedPressable
            onPress={() => onDoor(d.dest)}
            haptic="light"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 14,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: d.tint + '22',
            }}>
              {d.icon}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15.5, fontWeight: '700', marginBottom: 2 }}>{d.title}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>{d.body}</Text>
            </View>
            <ArrowRight color={colors.textMuted} size={18} />
          </AnimatedPressable>
        </Animated.View>
      ))}

      <AnimatedPressable
        onPress={onEnter}
        haptic="medium"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: colors.accent,
          borderRadius: 99,
          paddingVertical: 15,
          marginTop: 8,
        }}
        scaleValue={0.97}
      >
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{t('welcome.enterEcho')}</Text>
        <ArrowRight color="#fff" size={18} weight="bold" />
      </AnimatedPressable>
    </Animated.View>
  );
}
