import React, { useMemo, useState } from 'react';
import { ICON_SIZE } from '../../lib/ui/icons';
import { View, Text, Alert, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Flame, Microphone, Stop } from 'phosphor-react-native';
import { useDictation } from '../../hooks/useDictation';
import { joinDictation } from '../../lib/voice/dictation';
import { TextInput } from '../ui/TextInput';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { useTheme } from '../../lib/ui/theme';
import { useI18n } from '../../lib/i18n/i18n';
import { SpeakButton } from '../ui/SpeakButton';
import { submitDailyAnswer, type DailyQuestion } from '../../lib/supabaseEchoApi';
import { isAppOnline } from '../../lib/core/net';
import { outbox } from '../../store/outbox';
import { track } from '../../lib/core/analytics';
import { writeErrorMessage } from '../../lib/moderation/textFilterError';

export const MAX_ANSWER_LENGTH = 600;
/** The count appears only near the limit; "0/600" before typing was noise. */
const COUNTER_FROM = 480;

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
  submitFirstLabel,
  submitUpdateLabel,
}: DailyQuestionComposerProps) {
  const { colors, radius, fontSizes, font } = useTheme();
  const { t, tt } = useI18n();
  const [draft, setDraft] = useState(initialAnswer ?? '');
  const [submitting, setSubmitting] = useState(false);
  const answered = initialAnswer != null;

  // Speaking the answer. The words show in the box as they are heard and are
  // added to whatever was already typed once the sentence is finished.
  const [heard, setHeard] = useState('');
  const dictation = useDictation({
    onInterim: setHeard,
    onFinal: (text) => setDraft(d => joinDictation(d, text, MAX_ANSWER_LENGTH)),
  });
  const shown = heard ? joinDictation(draft, heard, MAX_ANSWER_LENGTH) : draft;

  const canSubmit = useMemo(
    () => draft.trim().length > 0 && draft.trim().length <= MAX_ANSWER_LENGTH && !submitting && !dictation.listening,
    [draft, submitting, dictation.listening],
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const answer = draft.trim();
    setSubmitting(true);
    try {
      if (persist) {
        // The daily question is the retention loop; losing an answer to a bad
        // signal is the one failure most likely to stop someone coming back.
        // Queue it instead. submitDailyAnswer upserts on (user, question), so
        // a replay is naturally idempotent.
        if (isAppOnline()) {
          await submitDailyAnswer(question.id, answer);
        } else {
          outbox.enqueue('dailyAnswer', { questionId: question.id, answer });
        }
        track('daily_answer_submitted', { question_id: question.id, is_update: answered, length: answer.length });
      }
      showToast(t('daily.answerSaved'));
      onSubmitted?.(answer);
    } catch (e) {
      Alert.alert(t('daily.submitFailed'), writeErrorMessage(e));
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
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSizes.caption, fontWeight: '700', letterSpacing: 1.2, ...font.bodySemibold }}>
              {t('daily.today')} · {new Date(question.active_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <SpeakButton text={tt(question.question)} id={`dq:${question.id}`} color="rgba(255,255,255,0.92)" size={18} />
              {streak > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 }}>
                  <Flame color="#fff" size={ICON_SIZE.xs} weight="fill" />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                    {t(streak === 1 ? 'daily.dayOne' : 'daily.dayMany', { count: streak })}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <Text style={{ color: '#fff', fontSize: 24, lineHeight: 32, ...font.display, letterSpacing: -0.3 }}>
            {tt(question.question)}
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
          {answered ? t('daily.yourAnswerEdit') : t('daily.yourAnswer')}
        </Text>
        <TextInput
          value={shown}
          onChangeText={(text) => setDraft(text.slice(0, MAX_ANSWER_LENGTH))}
          placeholder={t('daily.placeholder')}
          // Read-only while listening, so typed and spoken words cannot collide.
          editable={!dictation.listening}
          multiline
          numberOfLines={4}
          // numberOfLines does not size a TextInput on iOS: the box was one line
          // tall for an answer of up to 600 characters (2026-11-27).
          style={{ minHeight: 88, textAlignVertical: 'top' }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 10 }}>
          {dictation.listening ? (
            <Text style={{ flexShrink: 1, color: colors.accent, fontSize: fontSizes.caption, fontWeight: '600' }} accessibilityLiveRegion="polite">
              {t('voice.listening')} {t('voice.tapToStop')}
            </Text>
          ) : shown.length >= COUNTER_FROM ? (
            <Text style={{ color: shown.length >= MAX_ANSWER_LENGTH ? colors.danger : colors.textMuted, fontSize: fontSizes.caption }}>
              {shown.length}/{MAX_ANSWER_LENGTH}
            </Text>
          ) : <View />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {dictation.available && (
              <Pressable
                onPress={dictation.toggle}
                disabled={submitting}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={dictation.listening ? t('daily.dictateStop') : t('daily.dictate')}
                accessibilityState={{ selected: dictation.listening }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: dictation.listening ? colors.accent : colors.surfaceHover,
                  borderWidth: 1,
                  borderColor: dictation.listening ? colors.accent : colors.border,
                }}
              >
                {dictation.listening
                  ? <Stop color={colors.onAccent} size={ICON_SIZE.md} weight="fill" />
                  : <Microphone color={colors.text} size={ICON_SIZE.md} weight="bold" />}
              </Pressable>
            )}
            <Button
              label={answered ? (submitUpdateLabel ?? t('daily.update')) : (submitFirstLabel ?? t('daily.submit'))}
              onPress={() => void handleSubmit()}
              size="compact"
              disabled={!canSubmit}
              loading={submitting}
              leftIcon={Check}
            />
          </View>
        </View>
      </Animated.View>
    </>
  );
}
