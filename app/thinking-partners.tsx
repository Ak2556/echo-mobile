import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Brain, UsersThree, Lightning } from 'phosphor-react-native';
import { ProfileAvatar } from '../components/ui/ProfileAvatar';
import { useThinkingPartners } from '../hooks/queries/useThinkingPartners';
import { useToggleRemoteFollow } from '../hooks/queries/useSupabaseSocial';
import { GRADIENTS, NEON, neonGlow, neonHaptic } from '../lib/neonDesign';
import { useAppStore } from '../store/useAppStore';
import { track } from '../lib/analytics';
import type { ThinkingPartnerMode } from '../lib/supabaseEchoApi';
import type { User } from '../types';

type Partner = User & { affinity: number };

/**
 * Thinking-partner matching — a discovery surface powered by echo embeddings.
 * Toggle between kindred minds ('similar') and productive friction ('different').
 */
export default function ThinkingPartnersScreen() {
  const router = useRouter();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const [mode, setMode] = useState<ThinkingPartnerMode>('similar');
  const { data, isLoading, isError } = useThinkingPartners(mode);
  const partners = (data ?? []) as Partner[];

  // One view event per screen open — lets retention be sliced by exposure.
  useEffect(() => { track('thinking_partners_viewed'); }, []);

  const switchMode = (next: ThinkingPartnerMode) => {
    if (next === mode) return;
    if (hapticEnabled) void neonHaptic('select');
    setMode(next);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Brain color={NEON.violet} size={18} weight="fill" />
          <Text style={styles.headerTitle}>MINDS</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Mode toggle */}
      <View style={styles.toggleRow}>
        <ModeChip
          active={mode === 'similar'}
          onPress={() => switchMode('similar')}
          icon={<UsersThree size={16} color={mode === 'similar' ? '#000' : '#A1A1AA'} weight="fill" />}
          label="Think like you"
        />
        <ModeChip
          active={mode === 'different'}
          onPress={() => switchMode('different')}
          icon={<Lightning size={16} color={mode === 'different' ? '#000' : '#A1A1AA'} weight="fill" />}
          label="Think differently"
        />
      </View>

      <Text style={styles.subhead}>
        {mode === 'similar'
          ? 'People whose echoes map closest to yours — kindred minds worth following.'
          : 'People whose echoes diverge most from yours — productive friction.'}
      </Text>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={NEON.violet} size="large" />
          <Text style={styles.muted}>Reading the room…</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn&apos;t load matches right now.</Text>
        </View>
      ) : partners.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Not enough signal yet</Text>
          <Text style={styles.muted}>
            Publish a few echoes so we can map how you think, then check back.
          </Text>
        </View>
      ) : (
        <FlashList
          data={partners}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <PartnerRow partner={item} index={index} mode={mode} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ModeChip({
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
  if (active) {
    return (
      <Pressable onPress={onPress} style={{ flex: 1 }}>
        <LinearGradient
          colors={GRADIENTS.forYou}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.chip, neonGlow(NEON.violet, 'med')]}
        >
          {icon}
          <Text style={[styles.chipText, { color: '#000' }]}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={[styles.chip, styles.chipIdle, { flex: 1 }]}>
      {icon}
      <Text style={[styles.chipText, { color: '#A1A1AA' }]}>{label}</Text>
    </Pressable>
  );
}

function PartnerRow({
  partner,
  index,
  mode,
}: {
  partner: Partner;
  index: number;
  mode: ThinkingPartnerMode;
}) {
  const router = useRouter();
  const toggleFollow = useToggleRemoteFollow();
  const [following, setFollowing] = useState(false);

  // Map cosine similarity [-1,1] to a friendlier 0–100 "match" readout.
  const pct = Math.max(0, Math.min(100, Math.round(((partner.affinity + 1) / 2) * 100)));
  const accent = mode === 'similar' ? NEON.cyan : NEON.amber;

  const onFollow = () => {
    const next = !following;
    setFollowing(next);
    if (next) track('thinking_partner_followed', { mode, affinity: Number(partner.affinity.toFixed(3)) });
    toggleFollow.mutate({ userId: partner.id, follow: next });
  };

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(220)}>
      <Pressable style={styles.row} onPress={() => router.push(`/user/${partner.id}`)}>
        <ProfileAvatar
          displayName={partner.displayName}
          avatarColor={partner.avatarColor}
          avatarUrl={partner.avatarUrl}
          size={48}
          showGlow={false}
          isVerified={partner.isVerified}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.name} numberOfLines={1}>
            {partner.displayName}
          </Text>
          <Text style={styles.handle} numberOfLines={1}>
            @{partner.username} · {partner.echoCount} echoes
          </Text>
          <View style={styles.matchRow}>
            <View style={[styles.matchDot, { backgroundColor: accent }]} />
            <Text style={[styles.matchText, { color: accent }]}>
              {mode === 'similar' ? `${pct}% aligned` : `${100 - pct}% divergent`}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onFollow}
          style={[styles.followBtn, following && styles.followingBtn]}
          hitSlop={8}
        >
          <Text style={[styles.followText, following && { color: '#A1A1AA' }]}>
            {following ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 3 },
  toggleRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 999,
  },
  chipIdle: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A' },
  chipText: { fontWeight: '800', fontSize: 13.5, letterSpacing: 0.2 },
  subhead: {
    color: '#71717A',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 10 },
  muted: { color: '#A1A1AA', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#141418',
  },
  name: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  handle: { color: '#71717A', fontSize: 13, marginTop: 1 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  matchDot: { width: 7, height: 7, borderRadius: 4 },
  matchText: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2 },
  followBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  followingBtn: { backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A' },
  followText: { color: '#000', fontWeight: '800', fontSize: 13 },
});
