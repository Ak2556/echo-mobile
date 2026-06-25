import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, GitBranch, Heart, ChatCircle } from 'phosphor-react-native';
import { useRemixTree } from '../../hooks/queries/useFeed';
import { RemixButton } from '../../components/social/RemixButton';
import { GRADIENTS, ACCENT_COLORS, DISPLAY_TYPE, accentShadow, feedbackHaptic } from '../../lib/accentDesign';
import { useAppStore } from '../../store/useAppStore';
import { PERSPECTIVE_LABELS, PERSPECTIVE_TYPES } from '../../lib/perspectives';
import { track } from '../../lib/analytics';
import type { PerspectiveType, RemixTreeNode } from '../../types';

/**
 * Evolution tree viewer — full lineage of a single remix root. Renders the
 * recursive remix_root_id descendant chain as a depth-indented list with
 * connecting stems so the user can read the branching at a glance.
 */
export default function EvolutionTreeScreen() {
  const router = useRouter();
  const { rootId } = useLocalSearchParams<{ rootId: string }>();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const { data, isLoading, isError } = useRemixTree(rootId ? String(rootId) : undefined);
  const [sortMode, setSortMode] = useState<'strongest' | 'newest' | 'discussed'>('strongest');

  const nodes = data ?? [];
  const root = nodes.find(n => n.depth === 0);
  const remixes = nodes.filter(n => n.depth > 0);
  const sortedRemixes = useMemo(() => {
    const score = (node: RemixTreeNode) => node.likesCount + node.commentCount * 2 + node.repostCount * 2;
    return [...remixes].sort((a, b) => {
      if (sortMode === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortMode === 'discussed') return b.commentCount - a.commentCount || score(b) - score(a);
      return score(b) - score(a) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [remixes, sortMode]);
  const groups = useMemo(() => (
    PERSPECTIVE_TYPES
      .map(type => ({
        type,
        items: sortedRemixes.filter(node => (node.perspectiveType ?? 'reframe') === type),
      }))
      .filter(group => group.items.length > 0)
  ), [sortedRemixes]);

  useEffect(() => {
    if (rootId) track('evolution_opened', { root_id: String(rootId) });
  }, [rootId]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <View style={styles.headerCenter}>
          <GitBranch color={ACCENT_COLORS.magenta} size={18} weight="fill" />
          <Text style={styles.headerTitle}>EVOLUTION</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={ACCENT_COLORS.magenta} />
        </View>
      ) : isError || !root ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load this lineage</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
          <View>
            <RootCard
              node={root}
              totalRemixes={remixes.length}
              onPress={() => router.push({ pathname: '/thread/[id]', params: { id: root.id } })}
            />
            {remixes.length > 0 ? (
              <>
                <PerspectiveSummary remixes={remixes} />
                <SortControls value={sortMode} onChange={setSortMode} />
                {groups.map(group => (
                  <PerspectiveGroup
                    key={group.type}
                    type={group.type}
                    items={group.items}
                    onOpen={(item) => {
                      if (hapticEnabled) void feedbackHaptic('tap');
                      router.push({ pathname: '/thread/[id]', params: { id: item.id } });
                    }}
                  />
                ))}
              </>
            ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No perspectives yet</Text>
              <Text style={styles.emptySub}>Be the first to add another angle to this thought.</Text>
              <View style={{ marginTop: 18, alignItems: 'center' }}>
                <RemixButton
                  echoId={root.id}
                  remixCount={root.remixCount}
                  authorUsername={root.username}
                  authorTitle={root.title ?? undefined}
                />
              </View>
            </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function RootCard({
  node,
  totalRemixes,
  onPress,
}: {
  node: RemixTreeNode;
  totalRemixes: number;
  onPress: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 22 }}>
      <Pressable onPress={onPress}>
        <LinearGradient
          colors={GRADIENTS.evolutions}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.rootHero, accentShadow(ACCENT_COLORS.magenta, 'med')]}
        >
          <View style={styles.rootEyebrowRow}>
            <View style={styles.seedBadge}>
              <Text style={styles.seedBadgeText}>SEED</Text>
            </View>
            <Text style={styles.rootAuthor}>@{node.username}</Text>
          </View>
          <Text style={styles.rootTitle} numberOfLines={3}>
            {node.title || node.prompt}
          </Text>
          <Text style={styles.rootResponse} numberOfLines={3}>
            {node.response}
          </Text>
          <View style={styles.rootStatsRow}>
            <Stat label="perspectives" value={totalRemixes} />
            <Stat label="likes" value={node.likesCount} />
            <Stat label="comments" value={node.commentCount} />
          </View>
          <View style={{ marginTop: 14, alignSelf: 'flex-start' }}>
            <RemixButton
              echoId={node.id}
              remixCount={node.remixCount}
              authorUsername={node.username}
              authorTitle={node.title ?? undefined}
            />
          </View>
        </LinearGradient>
      </Pressable>
      <Text style={styles.lineageLabel}>HOW THIS THOUGHT EVOLVED</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PerspectiveSummary({ remixes }: { remixes: RemixTreeNode[] }) {
  return (
    <View style={styles.summaryWrap}>
      {PERSPECTIVE_TYPES.map(type => {
        const count = remixes.filter(node => (node.perspectiveType ?? 'reframe') === type).length;
        return (
          <View key={type} style={[styles.summaryChip, count > 0 && styles.summaryChipActive]}>
            <Text style={[styles.summaryCount, count > 0 && styles.summaryCountActive]}>{count}</Text>
            <Text style={styles.summaryLabel}>{PERSPECTIVE_LABELS[type]}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SortControls({ value, onChange }: { value: 'strongest' | 'newest' | 'discussed'; onChange: (value: 'strongest' | 'newest' | 'discussed') => void }) {
  const options: { value: 'strongest' | 'newest' | 'discussed'; label: string }[] = [
    { value: 'strongest', label: 'Strongest' },
    { value: 'newest', label: 'Newest' },
    { value: 'discussed', label: 'Most discussed' },
  ];
  return (
    <View style={styles.sortWrap}>
      {options.map(option => {
        const active = value === option.value;
        return (
          <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.sortPill, active && styles.sortPillActive]}>
            <Text style={[styles.sortText, active && styles.sortTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PerspectiveGroup({ type, items, onOpen }: { type: PerspectiveType; items: RemixTreeNode[]; onOpen: (item: RemixTreeNode) => void }) {
  return (
    <View style={styles.groupWrap}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{PERSPECTIVE_LABELS[type]}</Text>
        <Text style={styles.groupCount}>{items.length}</Text>
      </View>
      {items.map((item, index) => (
        <Animated.View key={item.id} entering={FadeInDown.delay(index * 25).duration(240)}>
          <RemixNode node={item} onPress={() => onOpen(item)} />
        </Animated.View>
      ))}
    </View>
  );
}

function RemixNode({ node, onPress }: { node: RemixTreeNode; onPress: () => void }) {
  // Cap visual indent at 4 levels so deep trees stay readable.
  const indent = Math.min(node.depth - 1, 4) * 18;
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 12, flexDirection: 'row' }}>
      {/* Lineage stem */}
      <View style={{ width: indent, alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 28 }}>
        {indent > 0 && (
          <LinearGradient
            colors={['rgba(34,245,255,0.0)', ACCENT_COLORS.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ width: 2, height: 24, borderRadius: 2 }}
          />
        )}
      </View>
      <Pressable onPress={onPress} style={[styles.nodeCard, { flex: 1 }]}>
        <View style={styles.nodeHeaderRow}>
          <View style={styles.depthChip}>
            <GitBranch color={ACCENT_COLORS.cyan} size={11} weight="fill" />
            <Text style={styles.depthChipText}>v{node.depth}</Text>
          </View>
          <View style={styles.perspectiveChip}>
            <Text style={styles.perspectiveChipText}>{PERSPECTIVE_LABELS[node.perspectiveType ?? 'reframe']}</Text>
          </View>
          <Text style={styles.nodeAuthor}>@{node.username}</Text>
        </View>
        <Text style={styles.nodeTitle} numberOfLines={2}>
          {node.title || node.prompt}
        </Text>
        <Text style={styles.nodeResponse} numberOfLines={3}>
          {node.response}
        </Text>
        <View style={styles.nodeStatsRow}>
          <View style={styles.nodeStat}>
            <Heart color="#71717A" size={13} weight="fill" />
            <Text style={styles.nodeStatText}>{node.likesCount}</Text>
          </View>
          <View style={styles.nodeStat}>
            <ChatCircle color="#71717A" size={13} weight="fill" />
            <Text style={styles.nodeStatText}>{node.commentCount}</Text>
          </View>
          {node.remixCount > 0 && (
            <View style={styles.nodeStat}>
              <GitBranch color={ACCENT_COLORS.magenta} size={13} weight="fill" />
              <Text style={[styles.nodeStatText, { color: ACCENT_COLORS.magenta }]}>{node.remixCount}</Text>
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 3,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    paddingHorizontal: 32,
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    color: '#71717A',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  rootHero: {
    borderRadius: 26,
    padding: 22,
  },
  rootEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  seedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#000',
    borderRadius: 999,
  },
  seedBadgeText: {
    color: ACCENT_COLORS.lime,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  rootAuthor: {
    color: 'rgba(0,0,0,0.78)',
    fontWeight: '800',
    fontSize: 13,
  },
  rootTitle: {
    ...DISPLAY_TYPE.title,
    color: '#000',
    marginBottom: 10,
  },
  rootResponse: {
    color: 'rgba(0,0,0,0.78)',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  rootStatsRow: {
    flexDirection: 'row',
    gap: 28,
    marginTop: 16,
  },
  statValue: {
    color: '#000',
    fontWeight: '900',
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: 'rgba(0,0,0,0.65)',
    fontWeight: '700',
    fontSize: 11,
    marginTop: 2,
  },
  lineageLabel: {
    ...DISPLAY_TYPE.eyebrow,
    color: ACCENT_COLORS.cyan,
    marginTop: 18,
    textAlign: 'center',
  },
  summaryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  summaryChip: {
    minWidth: '30%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    backgroundColor: '#101018',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryChipActive: {
    borderColor: 'rgba(34,245,255,0.45)',
    backgroundColor: 'rgba(34,245,255,0.10)',
  },
  summaryCount: {
    color: '#71717A',
    fontWeight: '900',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  summaryCountActive: {
    color: ACCENT_COLORS.cyan,
  },
  summaryLabel: {
    color: '#A1A1AA',
    fontWeight: '700',
    fontSize: 11,
    marginTop: 2,
  },
  sortWrap: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#101018',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  sortPillActive: {
    backgroundColor: ACCENT_COLORS.cyan,
    borderColor: ACCENT_COLORS.cyan,
  },
  sortText: {
    color: '#A1A1AA',
    fontWeight: '800',
    fontSize: 12,
  },
  sortTextActive: {
    color: '#000',
  },
  groupWrap: {
    marginBottom: 18,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  groupTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
  groupCount: {
    color: ACCENT_COLORS.cyan,
    fontWeight: '900',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  nodeCard: {
    borderRadius: 18,
    backgroundColor: '#101018',
    borderWidth: 1,
    borderColor: 'rgba(34,245,255,0.18)',
    padding: 14,
  },
  nodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  depthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(34,245,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,245,255,0.35)',
  },
  depthChipText: {
    color: ACCENT_COLORS.cyan,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  perspectiveChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,61,216,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,61,216,0.35)',
  },
  perspectiveChipText: {
    color: ACCENT_COLORS.magenta,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  nodeAuthor: {
    color: '#A1A1AA',
    fontWeight: '700',
    fontSize: 12,
  },
  nodeTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    lineHeight: 19,
    marginBottom: 6,
  },
  nodeResponse: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 18,
  },
  nodeStatsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
  },
  nodeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nodeStatText: {
    color: '#71717A',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
