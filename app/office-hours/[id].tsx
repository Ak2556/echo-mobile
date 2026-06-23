import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, Microphone, ArrowUp, Clock, UsersThree, PaperPlaneTilt } from 'phosphor-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { TextInput } from '../../components/ui/TextInput';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';
import { V2FeatureGuard } from '../../components/common/V2FeatureGuard';
import {
  fetchOfficeHour,
  fetchOfficeHourQuestions,
  setOfficeHourQuestionUpvote,
  setOfficeHourRSVP,
  submitOfficeHourQuestion,
  type OfficeHour,
  type OfficeHourQuestion,
} from '../../lib/supabaseEchoApi';

function OfficeHourDetailScreenInner() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, radius } = useTheme();

  const [oh, setOh] = useState<OfficeHour | null>(null);
  const [questions, setQuestions] = useState<OfficeHourQuestion[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => { return () => { mounted.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [a, b] = await Promise.all([fetchOfficeHour(id), fetchOfficeHourQuestions(id)]);
      if (!mounted.current) return;
      setOh(a);
      setQuestions(b);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const submitQ = async () => {
    if (!oh || draft.trim().length < 5) return;
    setSubmitting(true);
    try {
      await submitOfficeHourQuestion(oh.id, draft.trim());
      setDraft('');
      const refreshed = await fetchOfficeHourQuestions(oh.id);
      setQuestions(refreshed);
      showToast('Question added', 'Added');
    } catch (e) {
      Alert.alert('Could not submit', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUpvote = async (q: OfficeHourQuestion) => {
    const next = !q.has_upvoted;
    setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, has_upvoted: next, upvote_count: next ? x.upvote_count + 1 : Math.max(0, x.upvote_count - 1) } : x));
    try {
      await setOfficeHourQuestionUpvote(q.id, next);
    } catch {
      setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, has_upvoted: !next, upvote_count: next ? Math.max(0, x.upvote_count - 1) : x.upvote_count + 1 } : x));
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!oh) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <AnimatedPressable onPress={() => router.back()} style={{ padding: 4 }} scaleValue={0.88}>
            <ArrowLeft color={colors.text} size={24} />
          </AnimatedPressable>
        </View>
        <View style={{ padding: 24, alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>Session not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const liveNow = new Date(oh.starts_at).getTime() <= Date.now() && new Date(oh.ends_at).getTime() > Date.now();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18, flex: 1 }} numberOfLines={1}>
          Office Hours
        </Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {/* Session card */}
          <Animated.View
            entering={FadeInUp.duration(220)}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: 16,
              borderWidth: 1,
              borderColor: liveNow ? '#EF4444' : colors.border,
              marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Clock color={liveNow ? '#EF4444' : colors.accent} size={13} weight={liveNow ? 'fill' : 'regular'} />
              <Text style={{ color: liveNow ? '#EF4444' : colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
                {liveNow ? 'LIVE NOW' : new Date(oh.starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }).toUpperCase()}
              </Text>
            </View>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18, marginBottom: 6 }}>{oh.topic}</Text>
            {oh.description ? (
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 10 }}>{oh.description}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {oh.host && (
                  <>
                    <ProfileAvatar
                      displayName={oh.host.display_name}
                      avatarColor={oh.host.avatar_color}
                      avatarUrl={oh.host.avatar_url ?? undefined}
                      size={28}
                      showHalo={false}
                    />
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Hosted by @{oh.host.username}</Text>
                  </>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <UsersThree color={colors.textMuted} size={13} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{oh.rsvp_count}</Text>
              </View>
            </View>
            <AnimatedPressable
              onPress={async () => {
                const going = !oh.has_rsvp;
                setOh({ ...oh, has_rsvp: going, rsvp_count: going ? oh.rsvp_count + 1 : Math.max(0, oh.rsvp_count - 1) });
                try {
                  await setOfficeHourRSVP(oh.id, going);
                } catch {
                  setOh({ ...oh, has_rsvp: !going, rsvp_count: going ? Math.max(0, oh.rsvp_count - 1) : oh.rsvp_count + 1 });
                }
              }}
              style={{
                marginTop: 12,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 99,
                backgroundColor: oh.has_rsvp ? 'transparent' : colors.accent,
                borderWidth: oh.has_rsvp ? 1 : 0,
                borderColor: colors.border,
                alignItems: 'center',
              }}
              scaleValue={0.96}
              haptic="medium"
            >
              <Text style={{ color: oh.has_rsvp ? colors.text : '#fff', fontWeight: '700' }}>
                {oh.has_rsvp ? 'RSVP confirmed' : 'RSVP'}
              </Text>
            </AnimatedPressable>
          </Animated.View>

          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 8, marginLeft: 4 }}>
            Questions ({questions.length})
          </Text>

          {questions.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Microphone color={colors.textMuted} size={28} />
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                No questions yet. Be first — top-voted Qs get answered first.
              </Text>
            </View>
          ) : (
            questions.map((q) => (
              <View
                key={q.id}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  padding: 12,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <AnimatedPressable
                  onPress={() => void toggleUpvote(q)}
                  style={{
                    alignItems: 'center',
                    backgroundColor: q.has_upvoted ? colors.accent + '22' : 'transparent',
                    borderRadius: 12,
                    paddingHorizontal: 6,
                    paddingVertical: 4,
                    borderWidth: 1,
                    borderColor: q.has_upvoted ? colors.accent : colors.border,
                  }}
                  scaleValue={0.9}
                  haptic="light"
                >
                  <ArrowUp size={16} color={q.has_upvoted ? colors.accent : colors.textMuted} weight={q.has_upvoted ? 'bold' : 'regular'} />
                  <Text style={{ color: q.has_upvoted ? colors.accent : colors.textMuted, fontSize: 12, fontWeight: '700' }}>{q.upvote_count}</Text>
                </AnimatedPressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{q.question}</Text>
                  {q.asker && (
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                      @{q.asker.username}
                    </Text>
                  )}
                  {q.answer ? (
                    <View style={{ marginTop: 10, padding: 10, backgroundColor: colors.accent + '10', borderRadius: 8, borderLeftWidth: 2, borderLeftColor: colors.accent }}>
                      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>HOST</Text>
                      <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{q.answer}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Ask a question */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            padding: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ flex: 1 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask a question…"
              multiline
              maxLength={280}
            />
          </View>
          <AnimatedPressable
            onPress={() => void submitQ()}
            disabled={draft.trim().length < 5 || submitting}
            style={{
              width: 44, height: 44, borderRadius: 99,
              backgroundColor: draft.trim().length >= 5 ? colors.accent : colors.surfaceHover,
              alignItems: 'center', justifyContent: 'center',
            }}
            scaleValue={0.9}
            haptic="medium"
          >
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <PaperPlaneTilt color="#fff" size={18} weight="fill" />}
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function OfficeHourDetailScreen() { return <V2FeatureGuard flag="officeHours"><OfficeHourDetailScreenInner /></V2FeatureGuard>; }
