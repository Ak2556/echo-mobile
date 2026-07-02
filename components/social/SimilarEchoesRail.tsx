import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { GitBranch } from 'phosphor-react-native';
import { useSimilarEchoes } from '../../hooks/queries/useFeed';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { feedbackHaptic } from '../../lib/accentDesign';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';

interface SimilarEchoesRailProps {
  echoId: string;
  limit?: number;
}

/**
 * Horizontal rail that surfaces semantically-similar echoes (pgvector
 * cosine distance) under the current thread. Powers the "more like this"
 * discovery loop — meaningful even when the author has no other followers.
 */
export function SimilarEchoesRail({ echoId, limit = 8 }: SimilarEchoesRailProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const remote = isSupabaseRemote();
  const { data, isLoading } = useSimilarEchoes(echoId, limit);

  if (!remote) return null;
  if (!isLoading && (!data || data.length === 0)) return null;

  return (
    <View style={{ marginTop: 22, marginBottom: 8 }}>
      <Text style={[styles.headingText, { color: colors.textMuted }]}>Similar conversations</Text>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          decelerationRate="fast"
        >
          {(data ?? []).map(item => (
            <Pressable
              key={item.id}
              onPress={() => {
                if (hapticEnabled) void feedbackHaptic('tap');
                router.push({ pathname: '/thread/[id]', params: { id: item.id } });
              }}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.author, { color: colors.textMuted }]} numberOfLines={1}>
                @{item.username}
              </Text>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={3}>
                {item.editorialTitle || item.prompt}
              </Text>
              <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={3}>
                {item.response || item.prompt}
              </Text>
              <View style={styles.statsRow}>
                <Text style={[styles.stat, { color: colors.textMuted }]}>{item.likes} likes</Text>
                {(item.remixCount ?? 0) > 0 && (
                  <View style={styles.remixChip}>
                    <GitBranch color={colors.textMuted} size={11} />
                    <Text style={[styles.remixChipText, { color: colors.textMuted }]}>{item.remixCount}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  headingText: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  card: {
    width: 220,
    minHeight: 156,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  author: {
    fontWeight: '600',
    fontSize: 11,
    marginBottom: 6,
  },
  title: {
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 19,
    marginBottom: 6,
  },
  preview: {
    fontSize: 12,
    lineHeight: 17,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  stat: {
    fontSize: 12,
    fontWeight: '600',
  },
  remixChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  remixChipText: {
    fontWeight: '700',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
