import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GitBranch, Users, FireSimple } from 'phosphor-react-native';
import { useTrendingEvolutions } from '../../hooks/queries/useFeed';
import { GRADIENTS, NEON, TYPE, neonGlow, neonHaptic } from '../../lib/neonDesign';
import { useAppStore } from '../../store/useAppStore';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import type { EvolutionGroup } from '../../types';

/**
 * Evolutions tab — the signature AI-native surface. Shows trending remix
 * lineages: how a single seed prompt has branched across users. Tap to
 * open the full tree view.
 */
export default function EvolutionsScreen() {
  const router = useRouter();
  const remote = isSupabaseRemote();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const { data, isLoading, isError, refetch, isRefetching } = useTrendingEvolutions(30);

  const handlePress = (item: EvolutionGroup) => {
    if (hapticEnabled) void neonHaptic('select');
    router.push({ pathname: '/evolution/[rootId]', params: { rootId: item.rootId } });
  };

  const Header = (
    <View style={styles.heroWrap}>
      <LinearGradient
        colors={GRADIENTS.evolutions}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, neonGlow(NEON.magenta, 'med')]}
      >
        <GitBranch color="#000" size={32} weight="fill" />
        <Text style={styles.heroTitle}>EVOLUTIONS</Text>
        <Text style={styles.heroSub}>
          Watch how one prompt branches across people. Tap any seed to see every remix.
        </Text>
      </LinearGradient>
    </View>
  );

  if (!remote) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        {Header}
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Sign in to see evolutions</Text>
          <Text style={styles.emptySub}>Once you&apos;re online, the most-remixed prompts will appear here.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <FlashList
        data={data ?? []}
        keyExtractor={(item: EvolutionGroup) => item.rootId}
        contentContainerStyle={{ paddingBottom: 140 }}
        ListHeaderComponent={Header}
        onRefresh={() => { void refetch(); }}
        refreshing={isRefetching}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={NEON.magenta} />
              <Text style={styles.loadingText}>Tracing lineages…</Text>
            </View>
          ) : isError ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>Couldn&apos;t load evolutions</Text>
              <Text style={styles.emptySub}>Pull to try again.</Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No remix trees yet</Text>
              <Text style={styles.emptySub}>
                Be the first — tap Remix on any Echo to fork it.
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 30).duration(280)}>
            <EvolutionCard item={item} onPress={() => handlePress(item)} />
          </Animated.View>
        )}
      />
    </SafeAreaView>
  );
}

function EvolutionCard({ item, onPress }: { item: EvolutionGroup; onPress: () => void }) {
  const heat: 'cold' | 'warm' | 'hot' =
    item.branchCount >= 10 ? 'hot' : item.branchCount >= 4 ? 'warm' : 'cold';
  const heatColor = heat === 'hot' ? NEON.magenta : heat === 'warm' ? NEON.amber : NEON.cyan;
  const heatLabel = heat === 'hot' ? '🔥 ON FIRE' : heat === 'warm' ? '⚡ TRENDING' : '✨ FRESH';

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, heat === 'hot' ? neonGlow(NEON.magenta, 'med') : null]}
    >
      <View style={styles.cardInner}>
        <View style={styles.cardHeader}>
          <View style={[styles.heatPill, { backgroundColor: 'rgba(255,61,216,0.12)', borderColor: `${heatColor}55` }]}>
            <Text style={[styles.heatPillText, { color: heatColor }]}>{heatLabel}</Text>
          </View>
          <Text style={styles.author}>@{item.rootUsername}</Text>
        </View>

        <Text style={styles.title} numberOfLines={3}>
          {item.rootTitle || item.rootPrompt}
        </Text>

        <View style={styles.statsRow}>
          <Stat icon={<GitBranch color={NEON.cyan} size={16} weight="fill" />} label={`${item.branchCount}`} sub={item.branchCount === 1 ? 'remix' : 'remixes'} />
          <Stat icon={<Users color={NEON.lime} size={16} weight="fill" />} label={`${item.uniqueAuthors}`} sub={item.uniqueAuthors === 1 ? 'voice' : 'voices'} />
          <Stat icon={<FireSimple color={NEON.amber} size={16} weight="fill" />} label={`${item.treeEngagement}`} sub="engagement" />
        </View>
      </View>
    </Pressable>
  );
}

function Stat({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <View style={styles.stat}>
      {icon}
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  heroWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  hero: {
    borderRadius: 28,
    padding: 22,
  },
  heroTitle: {
    ...TYPE.hero,
    color: '#000',
    marginTop: 10,
  },
  heroSub: {
    color: 'rgba(0,0,0,0.78)',
    fontSize: 14,
    lineHeight: 19,
    marginTop: 10,
    fontWeight: '600',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 22,
    backgroundColor: '#101018',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  cardInner: {
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heatPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  heatPillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  author: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    ...TYPE.title,
    color: '#fff',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 18,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  statSub: {
    color: '#71717A',
    fontWeight: '600',
    fontSize: 12,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  loadingText: {
    color: '#A1A1AA',
    fontSize: 14,
  },
  emptyWrap: {
    paddingHorizontal: 32,
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    color: '#71717A',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
