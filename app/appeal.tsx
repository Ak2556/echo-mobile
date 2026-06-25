import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Scales, CheckCircle, Clock, X } from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { GlassPanel } from '../components/ui/GlassPanel';
import { showToast } from '../components/ui/Toast';
import { useTheme } from '../lib/theme';
import { fetchMyAppeals, submitAppeal, type MyAppeal } from '../lib/supabaseEchoApi';

const STATUS_CONFIG: Record<MyAppeal['status'], { label: string; color: string; Icon: React.ComponentType<any> }> = {
  pending:    { label: 'Under review',  color: '#F59E0B', Icon: Clock },
  upheld:     { label: 'Upheld — decision stands',     color: '#EF4444', Icon: X },
  overturned: { label: 'Overturned — content restored', color: '#10B981', Icon: CheckCircle },
};

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  return `${Math.floor(d / 30)} months ago`;
}

export default function AppealScreen() {
  const { reportId } = useLocalSearchParams<{ reportId?: string }>();
  const insets = useSafeAreaInsets();
  const { colors, fontSizes, radius } = useTheme();

  // Mode: 'new' when coming from a specific dismissed/resolved report
  const isNew = !!reportId;

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [appeals, setAppeals] = useState<MyAppeal[]>([]);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) return;
    fetchMyAppeals()
      .then(setAppeals)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isNew]);

  const MIN_CHARS = 20;
  const MAX_CHARS = 2000;
  const canSubmit = reason.trim().length >= MIN_CHARS && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !reportId) return;
    setSubmitting(true);
    try {
      await submitAppeal(reportId, reason);
      setSubmitted(true);
    } catch (e: any) {
      showToast(e?.message ?? 'Could not submit appeal', 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 8,
        paddingBottom: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={12} fadeOnPress>
          <ArrowLeft color={colors.text} size={22} />
        </AnimatedPressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: fontSizes.title, fontFamily: 'Inter_700Bold' }}>
            {isNew ? 'Appeal a decision' : 'My appeals'}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontFamily: 'Inter_400Regular', marginTop: 1 }}>
            {isNew ? 'Art. 20 — DSA internal appeals mechanism' : 'Your appeal history'}
          </Text>
        </View>
        <Scales color={colors.accent} size={22} weight="duotone" />
      </View>

      {/* New appeal form */}
      {isNew && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: insets.bottom + 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {submitted ? (
              <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center', paddingTop: 48, gap: 16 }}>
                <CheckCircle color="#10B981" size={56} weight="fill" />
                <Text style={{ color: colors.text, fontSize: fontSizes.title, fontFamily: 'Inter_700Bold', textAlign: 'center' }}>
                  Appeal submitted
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 }}>
                  We'll review your appeal and notify you of the outcome within 14 days, as required by the Digital Services Act.
                </Text>
                <AnimatedPressable
                  onPress={() => router.back()}
                  fadeOnPress
                  style={{
                    backgroundColor: colors.accent,
                    borderRadius: radius.full,
                    paddingHorizontal: 24,
                    paddingVertical: 12,
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: fontSizes.body }}>Done</Text>
                </AnimatedPressable>
              </Animated.View>
            ) : (
              <>
                {/* Context card */}
                <GlassPanel style={{ padding: 16, gap: 10 }}>
                  <Text style={{ color: colors.text, fontSize: fontSizes.body, fontFamily: 'Inter_600SemiBold' }}>
                    Your right to appeal
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontFamily: 'Inter_400Regular', lineHeight: 20 }}>
                    Under Article 20 of the EU Digital Services Act, you have the right to challenge any content moderation decision. Appeals are reviewed by a human moderator within 14 days.
                  </Text>
                </GlassPanel>

                {/* Reason input */}
                <View>
                  <Text style={{
                    color: colors.textMuted, fontSize: fontSizes.caption - 1,
                    fontFamily: 'Inter_500Medium', marginBottom: 8,
                  }}>
                    Why should this decision be reconsidered? *
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      color: colors.text,
                      fontSize: fontSizes.body,
                      fontFamily: 'Inter_400Regular',
                      padding: 14,
                      minHeight: 140,
                      textAlignVertical: 'top',
                    }}
                    multiline
                    placeholder="Explain why you believe this decision was incorrect — include any relevant context, evidence, or information the moderator may not have had."
                    placeholderTextColor={colors.textMuted}
                    value={reason}
                    onChangeText={t => setReason(t.slice(0, MAX_CHARS))}
                    returnKeyType="default"
                  />
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4, textAlign: 'right' }}>
                    {reason.length}/{MAX_CHARS}
                    {reason.length < MIN_CHARS && reason.length > 0 && (
                      <Text style={{ color: colors.danger }}>{` · ${MIN_CHARS - reason.length} more chars needed`}</Text>
                    )}
                  </Text>
                </View>

                {/* Submit */}
                <AnimatedPressable
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  depth="medium"
                  style={{
                    backgroundColor: canSubmit ? colors.accent : colors.border,
                    borderRadius: radius.full,
                    paddingVertical: 14,
                    alignItems: 'center',
                    marginTop: 4,
                  }}
                >
                  {submitting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: fontSizes.body }}>Submit appeal</Text>
                  }
                </AnimatedPressable>

                <Text style={{
                  color: colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular',
                  textAlign: 'center', lineHeight: 16,
                }}>
                  This appeal is subject to our Terms of Service. Frivolous appeals may affect your standing on the platform.
                </Text>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Appeals list (history view) */}
      {!isNew && (
        loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
          >
            {appeals.length === 0 ? (
              <View style={{ paddingTop: 48, alignItems: 'center', gap: 12 }}>
                <Scales color={colors.border} size={40} weight="duotone" />
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                  You haven't filed any appeals yet.{'\n'}Appeals appear here when you contest a moderation decision.
                </Text>
              </View>
            ) : (
              appeals.map((a, i) => {
                const cfg = STATUS_CONFIG[a.status];
                return (
                  <Animated.View key={a.id} entering={FadeInDown.delay(i * 60).springify()}>
                    <GlassPanel style={{ padding: 16, gap: 10 }}>
                      {/* Status row */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <cfg.Icon color={cfg.color} size={16} weight="fill" />
                        <Text style={{ color: cfg.color, fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1 }}>
                          {cfg.label}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                          {timeAgo(a.createdAt)}
                        </Text>
                      </View>

                      {/* Reason excerpt */}
                      <Text style={{ color: colors.textSecondary, fontSize: fontSizes.body, fontFamily: 'Inter_400Regular', lineHeight: 20 }} numberOfLines={3}>
                        {a.reason}
                      </Text>

                      {/* Moderator note */}
                      {a.moderatorNote && (
                        <View style={{
                          backgroundColor: colors.bg,
                          borderRadius: radius.md,
                          padding: 12,
                          borderLeftWidth: 3,
                          borderLeftColor: cfg.color,
                        }}>
                          <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 4 }}>
                            Moderator note
                          </Text>
                          <Text style={{ color: colors.text, fontSize: fontSizes.caption, fontFamily: 'Inter_400Regular', lineHeight: 18 }}>
                            {a.moderatorNote}
                          </Text>
                        </View>
                      )}

                      {/* Resolved date */}
                      {a.resolvedAt && (
                        <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                          Resolved {timeAgo(a.resolvedAt)}
                        </Text>
                      )}
                    </GlassPanel>
                  </Animated.View>
                );
              })
            )}
          </ScrollView>
        )
      )}
    </View>
  );
}
