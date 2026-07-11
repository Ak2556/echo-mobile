import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Fingerprint, Quotes } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useThinkingFingerprint } from '../../hooks/queries/useThinkingFingerprint';
import { track } from '../../lib/analytics';

/**
 * Thinking Fingerprint — an AI-synthesised portrait of how a user thinks,
 * derived from the embeddings + content of their echoes. Renders nothing until
 * the user has enough signal for a meaningful read (the edge function returns
 * ready=false → hook data is null), so it never shows an empty shell.
 */

/**
 * Rewrites a third-person summary into second person for the owner's own
 * profile, keeping sentence capitalization intact ("action. They are" →
 * "action. You are" — the old inline replace produced lowercase "you" at
 * sentence starts).
 */
function selfify(summary: string): string {
  return summary
    .replace(/\bthey\b/gi, 'you')
    .replace(/\btheir\b/gi, 'your')
    .replace(/(^|[.!?]\s+)(you|your)\b/g, (_m, pre, word) => pre + word[0].toUpperCase() + word.slice(1));
}

export function ThinkingFingerprintCard({ userId, isSelf }: { userId: string; isSelf?: boolean }) {
  const { colors, radius } = useTheme();
  const { data, isLoading } = useThinkingFingerprint(userId);

  // Fire once per user when the fingerprint actually renders (not while loading
  // or empty), so exposure to this feature can be cohorted against retention.
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (data && viewedRef.current !== userId) {
      viewedRef.current = userId;
      track('thinking_fingerprint_viewed', { is_self: !!isSelf, range: data.range, echo_count: data.echoCount });
    }
  }, [data, userId, isSelf]);

  if (isLoading) {
    return (
      <View style={{ marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Reading their thinking fingerprint…</Text>
      </View>
    );
  }

  if (!data) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      style={{
        marginHorizontal: 16,
        marginBottom: 16,
        padding: 16,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.accent + '33',
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Fingerprint color={colors.accent} size={18} weight="fill" />
        <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>
          THINKING FINGERPRINT
        </Text>
      </View>

      {/* Archetype */}
      <Text style={{ color: colors.text, fontSize: 22, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4, marginBottom: 8 }}>
        {data.archetype}
      </Text>

      {/* Summary */}
      {data.summary ? (
        <Text style={{ color: colors.textSecondary, fontSize: 14.5, lineHeight: 21, marginBottom: 14 }}>
          {isSelf ? selfify(data.summary) : data.summary}
        </Text>
      ) : null}

      {/* Theme chips */}
      {data.themes.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {data.themes.map((t) => (
            <View key={t} style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accentMuted }}>
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{t}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Range gauge: focused ↔ wide-ranging */}
      <View style={{ marginBottom: data.reasoningStyle || data.signatureQuestion ? 14 : 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>FOCUSED</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>WIDE-RANGING</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHover, overflow: 'hidden' }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.accent, width: `${Math.max(4, Math.min(100, data.range))}%` }} />
        </View>
      </View>

      {/* Reasoning style */}
      {data.reasoningStyle ? (
        <View style={{ marginBottom: data.signatureQuestion ? 12 : 0 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 3 }}>
            HOW {isSelf ? 'YOU' : 'THEY'} REASON
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {data.reasoningStyle}
          </Text>
        </View>
      ) : null}

      {/* Signature question */}
      {data.signatureQuestion ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Quotes color={colors.accent} size={16} weight="fill" style={{ marginTop: 2 }} />
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, fontStyle: 'italic', flex: 1 }}>
            {data.signatureQuestion}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
