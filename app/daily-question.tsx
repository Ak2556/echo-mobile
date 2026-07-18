import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeBack } from '../lib/safeBack';
import Animated, { FadeIn, FadeInUp, SlideInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, LockSimple, Sparkle, Lightning, Clock, Flame } from 'phosphor-react-native';
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
  fetchDivergentDailyAnswers,
  fetchDailyAnswerStreak,
  toggleDailyAnswerReaction,
  DAILY_REACTIONS,
  type DailyQuestion,
  type DailyAnswerWithAuthor,
  type DivergentDailyAnswer,
} from '../lib/supabaseEchoApi';
import { track } from '../lib/analytics';
import { captureException } from '../lib/monitoring';
import { recordAppOpen } from '../lib/personalNudges';

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
  const [divergent, setDivergent] = useState<DivergentDailyAnswer[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [view, setView] = useState<'recent' | 'divergent'>('recent');
  const [streak, setStreak] = useState(0);
  const mounted = useRef(true);

  useEffect(() => { return () => { mounted.current = false; }; }, []);

  // Bootstrap: today's question + viewer's previous answer (if any).
  useEffect(() => {
    void (async () => {
      try {
        const q = await fetchTodaysDailyQuestion();
        if (!mounted.current) return;
        setQuestion(q);
        if (q) {
          track('daily_question_viewed', { question_id: q.id });
          recordAppOpen('daily');
          const prior = await fetchOwnDailyAnswer(q.id);
          if (!mounted.current) return;
          if (prior) {
            setMyAnswer(prior);
            setDraft(prior);
          }
          fetchDailyAnswerStreak().then((s) => { if (mounted.current) setStreak(s); }).catch(() => {});
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
  }, []);

  const loadAnswers = useMemo(
    () => async () => {
      if (!question || !myAnswer) return;
      setAnswersLoading(true);
      try {
        const [recent, diverging] = await Promise.all([
          fetchDailyAnswers(question.id),
          fetchDivergentDailyAnswers(question.id).catch(() => [] as DivergentDailyAnswer[]),
        ]);
        if (!mounted.current) return;
        setAnswers(recent);
        setDivergent(diverging);
      } catch (e) {
        captureException(e, { tags: { screen: 'daily-question', action: 'fetch-answers' } });
      } finally {
        if (mounted.current) setAnswersLoading(false);
      }
    },
    // Intentionally keyed on question?.id (not the whole question object) so the
    // loader is only recreated when the question actually changes, not on every
    // identity change — which would trigger redundant answer re-fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.id, myAnswer],
  );

  // Whenever the viewer has answered, load (and refresh) the answer feed.
  useEffect(() => { void loadAnswers(); }, [loadAnswers]);

  const canSubmit = useMemo(
    () => draft.trim().length > 0 && draft.trim().length <= MAX_ANSWER_LENGTH && !submitting,
    [draft, submitting],
  );

  // Optimistically toggle a reaction on an answer in either list, then persist.
  const handleReact = async (answerId: string, emoji: string) => {
    const mutate = (a: DailyAnswerWithAuthor): DailyAnswerWithAuthor => {
      if (a.id !== answerId) return a;
      const had = a.myReactions.includes(emoji);
      const reactions = a.reactions
        .map(r => r.emoji === emoji ? { ...r, count: r.count + (had ? -1 : 1) } : r)
        .filter(r => r.count > 0);
      if (!had && !reactions.some(r => r.emoji === emoji)) reactions.push({ emoji, count: 1 });
      return {
        ...a,
        reactions,
        myReactions: had ? a.myReactions.filter(e => e !== emoji) : [...a.myReactions, emoji],
      };
    };
    setAnswers(prev => prev.map(mutate));
    setDivergent(prev => prev.map(d => ({ ...mutate(d), divergence: d.divergence })));
    try {
      await toggleDailyAnswerReaction(answerId, emoji);
    } catch (e) {
      // Revert on failure by reloading the authoritative lists.
      captureException(e, { tags: { screen: 'daily-question', action: 'react' } });
      void loadAnswers();
    }
  };

  const handleSubmit = async () => {
    if (!question || !canSubmit) return;
    setSubmitting(true);
    try {
      await submitDailyAnswer(question.id, draft.trim());
      track('daily_answer_submitted', { question_id: question.id, is_update: !!myAnswer, length: draft.trim().length });
      const firstAnswerToday = !myAnswer;
      setMyAnswer(draft.trim());
      showToast('Your answer is in.', 'Saved');
      if (firstAnswerToday) {
        fetchDailyAnswerStreak().then((s) => { if (mounted.current) setStreak(s); }).catch(() => {});
      }
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
        <ScreenHeader title="Daily Question" onBack={() => safeBack()} />
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
      <ScreenHeader title="Daily Question" onBack={() => safeBack()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            myAnswer ? (
              <RefreshControl refreshing={answersLoading} onRefresh={() => void loadAnswers()} tintColor={colors.accent} />
            ) : undefined
          }
        >
          {/* Prompt card — same gradient canvas as the home entry point. */}
          <Animated.View
            entering={FadeInUp.delay(50).duration(220)}
            style={{ borderRadius: 22, overflow: 'hidden', marginBottom: 16 }}
          >
            <LinearGradient
              colors={['#E8834E', '#C94F1D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 20 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSizes.caption, fontWeight: '700', letterSpacing: 1.2, fontFamily: 'Inter_600SemiBold' }}>
                  TODAY · {new Date(question.active_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
                {streak > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 }}>
                    <Flame color="#fff" size={13} weight="fill" />
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                      {streak} day{streak === 1 ? '' : 's'}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ color: '#fff', fontSize: 24, lineHeight: 32, fontFamily: 'Fraunces_500Medium', letterSpacing: -0.3 }}>
                {question.question}
              </Text>
            </LinearGradient>
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
                  {view === 'divergent' ? 'Most divergent takes' : "Everyone's takes"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
                  {answers.length} answer{answers.length === 1 ? '' : 's'}
                </Text>
              </View>

              {/* Recent ↔ divergence toggle */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <ViewChip
                  active={view === 'recent'}
                  onPress={() => setView('recent')}
                  icon={<Clock size={14} weight="fill" color={view === 'recent' ? '#fff' : colors.textMuted} />}
                  label="Recent"
                />
                <ViewChip
                  active={view === 'divergent'}
                  onPress={() => {
                    if (view !== 'divergent') track('daily_divergence_viewed', { question_id: question.id, answer_count: divergent.length });
                    setView('divergent');
                  }}
                  icon={<Lightning size={14} weight="fill" color={view === 'divergent' ? '#fff' : colors.textMuted} />}
                  label="Most divergent"
                />
              </View>

              {view === 'divergent' && (
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginBottom: 12, marginHorizontal: 4, lineHeight: 18 }}>
                  Ranked by how far each take sits from the day&apos;s consensus — the boldest outliers first.
                </Text>
              )}

              {answersLoading ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
              ) : view === 'divergent' ? (
                divergent.length === 0 ? (
                  <View style={{
                    backgroundColor: colors.surface,
                    borderRadius: radius.lg,
                    padding: 20,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                  }}>
                    <Lightning color={colors.accent} size={24} weight="fill" />
                    <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginTop: 12, textAlign: 'center', lineHeight: 20 }}>
                      Divergence ranking warms up as more people answer. Check back later to see today&apos;s boldest takes.
                    </Text>
                  </View>
                ) : (
                  divergent.map((a) => (
                    <AnswerCard key={a.id} a={a} divergence={a.divergence} onReact={handleReact} />
                  ))
                )
              ) : answers.length === 0 ? (
                <View style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                }}>
                  <Sparkle color={colors.accent} size={24} weight="fill" />
                  <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, marginTop: 12, textAlign: 'center', lineHeight: 20 }}>
                    You&apos;re the first to answer today. Check back later to see how everyone else thinks about it.
                  </Text>
                </View>
              ) : (
                answers.map((a) => (
                  <AnswerCard key={a.id} a={a} onReact={handleReact} />
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
  const { colors } = useTheme();
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

function ViewChip({
  active,
  onPress,
  icon,
  label,
}: {
  active: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 99,
        backgroundColor: active ? colors.accent : colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
      }}
      scaleValue={0.95}
      haptic="light"
    >
      {icon}
      <Text style={{ color: active ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function AnswerCard({
  a, divergence, onReact,
}: {
  a: DailyAnswerWithAuthor;
  divergence?: number;
  onReact?: (answerId: string, emoji: string) => void;
}) {
  const router = useRouter();
  const { colors, radius, fontSizes } = useTheme();
  const countFor = (emoji: string) => a.reactions.find(r => r.emoji === emoji)?.count ?? 0;
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Header + answer body navigate to the author's profile. */}
      <AnimatedPressable onPress={() => router.push(`/user/${a.author.username}`)} scaleValue={0.99} haptic="none">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <ProfileAvatar
            displayName={a.author.display_name}
            avatarColor={a.author.avatar_color}
            avatarUrl={a.author.avatar_url ?? undefined}
            size={32}
            showHalo={false}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.small }}>
              {a.author.display_name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
              @{a.author.username}
            </Text>
          </View>
          {divergence != null && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 99,
              backgroundColor: colors.accent + '1F',
            }}>
              <Lightning size={11} weight="fill" color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: fontSizes.caption, fontWeight: '800' }}>
                {divergence}% divergent
              </Text>
            </View>
          )}
        </View>
        <LinkifiedText
          text={a.answer}
          style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}
        />
      </AnimatedPressable>

      {/* Reaction row — earnest set, count shown when > 0, viewer's own tinted. */}
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {DAILY_REACTIONS.map((emoji) => {
          const count = countFor(emoji);
          const mine = a.myReactions.includes(emoji);
          return (
            <AnimatedPressable
              key={emoji}
              onPress={() => onReact?.(a.id, emoji)}
              scaleValue={0.9}
              haptic="light"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: 99,
                backgroundColor: mine ? colors.accent + '22' : colors.surfaceHover,
                borderWidth: 1,
                borderColor: mine ? colors.accent + '66' : 'transparent',
              }}
            >
              <Text style={{ fontSize: 13 }}>{emoji}</Text>
              {count > 0 && (
                <Text style={{ color: mine ? colors.accent : colors.textMuted, fontSize: fontSizes.caption, fontWeight: '700' }}>
                  {count}
                </Text>
              )}
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

export default function DailyQuestionScreen() { return <V2FeatureGuard flag="dailyQuestion"><DailyQuestionScreenInner /></V2FeatureGuard>; }
