import React, { useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Flame } from 'phosphor-react-native';
import { TextInput } from '../ui/TextInput';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { showToast } from '../ui/Toast';
import { useTheme } from '../../lib/theme';
import { submitDailyAnswer, type DailyQuestion } from '../../lib/supabaseEchoApi';
import { track } from '../../lib/analytics';

export const MAX_ANSWER_LENGTH = 600;

interface DailyQuestionComposerProps {
  question: DailyQuestion;
  /** Consecutive-day count, shown as a flame badge when > 0. */
  streak?: number;
  /** Viewer's prior answer, pre-filled into the input. */
  initialAnswer?: string | null;
  /** Persist to `daily_answers`. Pass false for the local first-run fallback
   *  question (its id has no FK row). Defaults to true. */
  persist?: boolean;
  /** Fired after a successful submit (or a non-persisted local submit). */
  onSubmitted?: (answer: string) => void;
  submitFirstLabel?: string;
  submitUpdateLabel?: string;
}

/**
 * The compose half of the daily ritual — the gradient prompt card plus the
 * answer input and submit button. Extracted from the daily-question screen so
 * the first-run value moment (/welcome) can lead with the exact same aha.
 *
 * Owns its own draft + submit state; the parent keeps `question`/`streak` and
 * reacts via `onSubmitted`.
 */
export function DailyQuestionComposer({
  question,
  streak = 0,
  initialAnswer = null,
  persist = true,
  onSubmitted,
  submitFirstLabel = 'Submit',
  submitUpdateLabel = 'Update',
}: DailyQuestionComposerProps) {
  const { colors, radius, fontSizes } = useTheme();
  const [draft, setDraft] = useState(initialAnswer ?? '');
  const [submitting, setSubmitting] = useState(false);
  const answered = initialAnswer != null;

  const canSubmit = useMemo(
    () => draft.trim().length > 0 && draft.trim().length <= MAX_ANSWER_LENGTH && !submitting,
    [draft, submitting],
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const answer = draft.trim();
    setSubmitting(true);
    try {
      if (persist) {
        await submitDailyAnswer(question.id, answer);
        track('daily_answer_submitted', { question_id: question.id, is_update: answered, length: answer.length });
      }
      showToast('Your answer is in.', 'Saved');
      onSubmitted?.(answer);
    } catch (e) {
      Alert.alert('Could not submit', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Prompt card */}
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
          {answered ? 'Your answer (you can edit anytime)' : 'Your answer'}
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
              {answered ? submitUpdateLabel : submitFirstLabel}
            </Text>
          </AnimatedPressable>
        </View>
      </Animated.View>
    </>
  );
}
