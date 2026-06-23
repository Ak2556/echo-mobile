import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkle, GitBranch } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSimilarEchoes } from '../../hooks/queries/useFeed';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { ACCENT_COLORS, DISPLAY_TYPE, accentShadow, feedbackHaptic } from '../../lib/accentDesign';
import { useAppStore } from '../../store/useAppStore';

interface SimilarEchoesRailProps {
  echoId: string;
  limit?: number;
}

/**
 * Horizontal rail that surfaces semantically-similar echoes (pgvector
 * cosine distance) under the current thread. Powers the "more like this"
 * discovery loop — meaningful even when the author has no other followers.
 *
 * Related Echoes rail with high-emphasis cards.
 */
export function SimilarEchoesRail({ echoId, limit = 8 }: SimilarEchoesRailProps) {
  const router = useRouter();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const remote = isSupabaseRemote();
  const { data, isLoading } = useSimilarEchoes(echoId, limit);

  if (!remote) return null;
  if (!isLoading && (!data || data.length === 0)) return null;

  return (
    <View style={{ marginTop: 22, marginBottom: 8 }}>
      <View style={styles.heading}>
        <Sparkle color={ACCENT_COLORS.cyan} size={16} weight="fill" />
        <Text style={styles.headingText}>SIMILAR CONVERSATIONS</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={ACCENT_COLORS.cyan} />
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
              style={[styles.card, accentShadow(ACCENT_COLORS.cyan, 'soft')]}
            >
              {/* Background tint for depth. */}
              <LinearGradient
                colors={['rgba(34,245,255,0.10)', 'rgba(155,91,255,0.08)', 'rgba(255,61,216,0.06)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.author} numberOfLines={1}>
                @{item.username}
              </Text>
              <Text style={styles.title} numberOfLines={3}>
                {item.editorialTitle || item.prompt}
              </Text>
              <Text style={styles.preview} numberOfLines={3}>
                {item.response || item.prompt}
              </Text>
              <View style={styles.statsRow}>
                <Text style={styles.stat}>{item.likes} likes</Text>
                {(item.remixCount ?? 0) > 0 && (
                  <View style={styles.remixChip}>
                    <GitBranch color={ACCENT_COLORS.magenta} size={11} weight="fill" />
                    <Text style={styles.remixChipText}>{item.remixCount}</Text>
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
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  headingText: {
    ...DISPLAY_TYPE.eyebrow,
    color: ACCENT_COLORS.cyan,
  },
  card: {
    width: 220,
    minHeight: 156,
    padding: 14,
    borderRadius: 20,
    backgroundColor: '#0F0F14',
    borderWidth: 1,
    borderColor: 'rgba(34,245,255,0.22)',
    overflow: 'hidden',
  },
  author: {
    color: ACCENT_COLORS.cyan,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  title: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
    lineHeight: 19,
    marginBottom: 6,
  },
  preview: {
    color: '#A1A1AA',
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
    color: '#71717A',
    fontSize: 12,
    fontWeight: '800',
  },
  remixChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,61,216,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,61,216,0.35)',
  },
  remixChipText: {
    color: ACCENT_COLORS.magenta,
    fontWeight: '900',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
