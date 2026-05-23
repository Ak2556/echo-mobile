import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp, SlideInDown } from 'react-native-reanimated';
import { ArrowLeft, Check, LockSimple, Sparkle } from 'phosphor-react-native';
import { TextInput } from '../components/ui/TextInput';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../components/ui/ProfileAvatar';
import { showToast } from '../components/ui/Toast';
import { LinkifiedText } from '../components/social/LinkifiedText';
import { useTheme } from '../lib/theme';
import { V2FeatureGuard } from '../components/common/V2FeatureGuard';
import {
  fetchTodaysDailyQuestion,
  fetchOwnDailyAnswer,
  submitDailyAnswer,
  fetchDailyAnswers,
  type DailyQuestion,
  type DailyAnswerWithAuthor,
} from '../lib/supabaseEchoApi';

/**
 * Daily Question — Echo's twist on BeReal's daily ritual.
 *
 * Same prompt for everyone, every day. You compose your answer first;
 * only then does the rest of the community's answer feed reveal itself.
 * Keeps the discovery experience earnest rather than performative.
 *
 * Reveal-after-answer is enforced client-side: until `myAnswer` is set,
 * we never call fetchDailyAnswers; once you submit, the feed slides in.
 */

const MAX_ANSWER_LENGTH = 600;

function DailyQuestionScreenInner() {
  const router = useRouter();
  const { colors, radius, fontSizes } = useTheme();

  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [myAnswer, setMyAnswer] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<DailyAnswerWithAuthor[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);

  // Bootstrap: today's question + viewer's previous answer (if any).
  useEffect(() => {
    void (async () => {
      try {
        const q = await fetchTodaysDailyQuestion();
        setQuestion(q);
        if (q) {
          const prior = await fetchOwnDailyAnswer(q.id);
          if (prior) {
            setMyAnswer(prior);
            setDraft(prior);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Whenever the viewer has answered, load (and refresh) the answer feed.
  useEffect(() => {
    if (!question || !myAnswer) return;
    void (async () => {
      setAnswersLoading(true);
      try {
        const rows = await fetchDailyAnswers(question.id);
        setAnswers(rows);
      } catch (e) {
        console.warn('[daily-question] fetch answers failed', e);
      } finally {
        setAnswersLoading(false);
      }
    })();
  }, [question?.id, myAnswer]);

  const canSubmit = useMemo(
    () => draft.trim().length > 0 && draft.trim().length <= MAX_ANSWER_LENGTH && !submitting,
    [draft, submitting],
  );

  const handleSubmit = async () => {
    if (!question || !canSubmit) return;
    setSubmitting(true);
    try {
      await submitDailyAnswer(question.id, draft.trim());
      setMyAnswer(draft.trim());
      showToast('Your answer is in.', '✨');
    } catch (e) {
      Alert.alert('Could not submit', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!question) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Daily Question" onBack={() => router.back()} />
        <View style={{ padding: 24, alignItems: 'center', marginTop: 80 }}>
          <Sparkle color={colors.textMuted} size={40} />
          <Text style={{ color: colors.textMuted, marginTop: 16, textAlign: 'center', lineHeight: 22 }}>
            No question today. Come back tomorrow — a fresh prompt drops every day at midnight.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Daily Question" onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {/* Prompt card — large, hero-feeling */}
          <Animated.View
            entering={FadeInUp.delay(50).duration(220)}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: 20,
              borderWidth: 1,
              borderColor: colors.accent + '33',
              marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Sparkle color={colors.accent} size={14} weight="fill" />
              <Text style={{ color: colors.accent, fontSize: fontSizes.caption, fontWeight: '700', letterSpacing: 0.6 }}>
                TODAY · {new Date(question.active_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 30 }}>
              {question.question}
            </Text>
          </Animated.View>

          {/* Compose card */}
          <Animated.View
            entering={FadeInUp.delay(150).duration(220)}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginBottom: 8, fontWeight: '500' }}>
              {myAnswer ? 'Your answer (you can edit anytime)' : 'Your answer'}
            </Text>
            <TextInput
              value={draft}
              onChangeText={(t) => setDraft(t.slice(0, MAX_ANSWER_LENGTH))}
              placeholder="Distill your take in a sentence or two…"
              multiline
              numberOfLines={4}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
                {draft.length}/{MAX_ANSWER_LENGTH}
              </Text>
              <AnimatedPressable
                onPress={() => void handleSubmit()}
                disabled={!canSubmit}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 99,
                  backgroundColor: canSubmit ? colors.accent : colors.surfaceHover,
                }}
                scaleValue={0.94}
                haptic="medium"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Check color="#fff" size={14} weight="bold" />
                )}
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
                  {myAnswer ? 'Update' : 'Submit'}
                </Text>
              </AnimatedPressable>
            </View>
          </Animated.View>

          {/* Reveal-after-answer gate */}
          {!myAnswer ? (
            <Animated.View
              entering={FadeIn.delay(300)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.lg,
                padding: 20,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
              }}
            >
              <LockSimple color={colors.textMuted} size={28} />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, marginTop: 12, textAlign: 'center', lineHeight: 20 }}>
                Submit your answer to see how the rest of Echo answered today.
              </Text>
            </Animated.View>
          ) : (
            <Animated.View entering={SlideInDown.duration(220)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginHorizontal: 4 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>
                  Everyone's takes
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
                  {answers.length} answer{answers.length === 1 ? '' : 's'}
                </Text>
              </View>
              {answersLoading ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
              ) : (
                answers.map((a) => (
                  <AnswerCard key={a.id} a={a} />
                ))
              )}
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors, fontSizes } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <AnimatedPressable onPress={onBack} style={{ padding: 4 }} scaleValue={0.88} haptic="light">
        <ArrowLeft color={colors.text} size={24} />
      </AnimatedPressable>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>{title}</Text>
      <View style={{ width: 28 }} />
    </View>
  );
}

function AnswerCard({ a }: { a: DailyAnswerWithAuthor }) {
  const router = useRouter();
  const { colors, radius, fontSizes } = useTheme();
  return (
    <AnimatedPressable
      onPress={() => router.push(`/user/${a.author.username}`)}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
      }}
      scaleValue={0.98}
      haptic="none"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <ProfileAvatar
          displayName={a.author.display_name}
          avatarColor={a.author.avatar_color}
          avatarUrl={a.author.avatar_url ?? undefined}
          size={32}
          showGlow={false}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.small }}>
            {a.author.display_name}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
            @{a.author.username}
          </Text>
        </View>
      </View>
      <LinkifiedText
        text={a.answer}
        style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}
      />
    </AnimatedPressable>
  );
}

export default function DailyQuestionScreen() { return <V2FeatureGuard flag="dailyQuestion"><DailyQuestionScreenInner /></V2FeatureGuard>; }
