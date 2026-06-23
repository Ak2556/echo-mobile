import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, Alert, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, GitBranch, PaperPlaneRight, Sparkle } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { fetchRemoteEchoById, fetchEchoConversationSnapshot } from '../../lib/supabaseEchoApi';
import { setPendingPublishContext } from '../../lib/publishContext';
import { GRADIENTS, ACCENT_COLORS, DISPLAY_TYPE, accentShadow, feedbackHaptic } from '../../lib/accentDesign';
import { track } from '../../lib/analytics';
import { PERSPECTIVE_DESCRIPTIONS, PERSPECTIVE_LABELS, PERSPECTIVE_TYPES, isValidSourceUrl } from '../../lib/perspectives';
import type { ChatMessage, PerspectiveType } from '../../types';

/**
 * Add Perspective entry screen.
 *
 * Shows the parent echo's full conversation, then spins up a fresh chat
 * session pre-seeded with that history so the user can branch the
 * conversation. Once they're back at /share, the parent lineage flows
 * through via the staged publishContext.
 */
export default function RemixScreen() {
  const router = useRouter();
  const { id, author, parentTitle } = useLocalSearchParams<{
    id: string;
    author?: string;
    parentTitle?: string;
  }>();
  const createSession = useAppStore(s => s.createSession);
  const setMessages = useAppStore(s => s.setMessages);
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const [launching, setLaunching] = useState(false);
  const [perspectiveType, setPerspectiveType] = useState<PerspectiveType>('reframe');
  const [sourceUrl, setSourceUrl] = useState('');
  // Fork point: index of the LAST message included in the branch (inclusive).
  // null = branch from the end (the whole conversation), the default.
  const [forkPoint, setForkPoint] = useState<number | null>(null);

  const echoQuery = useQuery({
    queryKey: ['echo', id],
    queryFn: () => fetchRemoteEchoById(String(id)),
    enabled: !!id,
  });

  const snapshotQuery = useQuery({
    queryKey: ['echo-snapshot', id],
    queryFn: () => fetchEchoConversationSnapshot(String(id)),
    enabled: !!id,
  });

  const parent = echoQuery.data;
  const snapshot = snapshotQuery.data ?? [];

  // How many leading messages the branch keeps. null forkPoint = keep all.
  const branchCount = forkPoint == null ? snapshot.length : forkPoint + 1;
  const isPartialBranch = branchCount < snapshot.length;

  const handleStartRemix = () => {
    if (!parent) return;
    if (!isValidSourceUrl(sourceUrl)) {
      Alert.alert('Check source URL', 'Evidence links need to start with http:// or https://.');
      return;
    }
    if (hapticEnabled) void feedbackHaptic('remix');
    setLaunching(true);
    // Fires the moment a perspective branch is committed, so this is a true
    // intent signal: started branch -> published linked Echo.
    track('remix_started', { is_partial_branch: isPartialBranch, branch_count: branchCount });
    track('perspective_started', { perspective_type: perspectiveType, is_partial_branch: isPartialBranch, branch_count: branchCount });
    const titleSource =
      parent.editorialTitle || (parentTitle ? String(parentTitle) : '') || parent.prompt.slice(0, 40) || 'Perspective';
    const sessionId = createSession(`Perspective · ${titleSource}`.slice(0, 60));
    // Seed only up to the chosen fork point so the user branches from there.
    const seeded: ChatMessage[] = snapshot.slice(0, branchCount).map((m, idx) => ({
      id: `seed-${idx}-${Date.now()}`,
      role: m.role,
      content: m.content,
      createdAt: new Date().toISOString(),
    }));
    setMessages(sessionId, seeded);
    setPendingPublishContext({
      parentEchoId: parent.id,
      parentAuthorUsername: parent.username,
      parentTitle: parent.editorialTitle || titleSource,
      perspectiveType,
      sourceUrl: sourceUrl.trim() || undefined,
    });
    router.replace('/(tabs)/chat');
  };

  const isLoading = echoQuery.isLoading || snapshotQuery.isLoading;
  const hasError = echoQuery.isError || (!isLoading && !parent);

  useEffect(() => {
    if (snapshotQuery.isError) {
      Alert.alert('Could not load conversation', 'This Echo cannot accept a new perspective right now.');
    }
  }, [snapshotQuery.isError]);

  const parentAuthor = author ?? parent?.username ?? 'someone';
  const parentRemixCount = parent?.remixCount ?? 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <View style={styles.headerCenter}>
          <GitBranch color={ACCENT_COLORS.cyan} size={18} weight="fill" />
          <Text style={styles.headerTitle}>ADD PERSPECTIVE</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={ACCENT_COLORS.cyan} size="large" />
          <Text style={{ color: '#A1A1AA', marginTop: 16, fontSize: 14 }}>Loading conversation…</Text>
        </View>
      ) : hasError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
            Couldn&apos;t load this Echo.
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Go back</Text>
          </Pressable>
        </View>
      ) : parent ? (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 160 }}>
            {/* Branch summary */}
            <Animated.View entering={FadeInDown.duration(280)}>
              <LinearGradient
                colors={GRADIENTS.remix}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.hero, accentShadow(ACCENT_COLORS.violet, 'med')]}
              >
                <View style={styles.heroInner}>
                  <View style={styles.heroIconWrap}>
                    <Sparkle color="#000" size={26} weight="fill" />
                  </View>
                  <Text style={styles.heroEyebrow}>WATCH THIS THOUGHT EVOLVE</Text>
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    Add perspective to @{parentAuthor}&apos;s Echo
                  </Text>
                  <Text style={styles.heroSub}>
                    Choose how you&apos;re responding, then continue the thought. Your Echo becomes part of the Evolution.
                  </Text>
                  {parentRemixCount > 0 && (
                    <View style={styles.heroChip}>
                      <GitBranch color="#000" size={12} weight="fill" />
                      <Text style={styles.heroChipText}>
                        {parentRemixCount} {parentRemixCount === 1 ? 'perspective' : 'perspectives'} already
                      </Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
            </Animated.View>

            <Text style={styles.sectionLabel}>What kind of perspective are you adding?</Text>
            <View style={styles.typeGrid}>
              {PERSPECTIVE_TYPES.map(type => {
                const active = perspectiveType === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => {
                      setPerspectiveType(type);
                      track('perspective_type_selected', { perspective_type: type });
                      if (hapticEnabled) void feedbackHaptic('select');
                    }}
                    style={[styles.typeCard, active && styles.typeCardActive]}
                  >
                    <Text style={[styles.typeTitle, active && styles.typeTitleActive]}>{PERSPECTIVE_LABELS[type]}</Text>
                    <Text style={styles.typeDescription}>{PERSPECTIVE_DESCRIPTIONS[type]}</Text>
                  </Pressable>
                );
              })}
            </View>

            {perspectiveType === 'evidence' && (
              <View style={styles.sourceWrap}>
                <Text style={styles.sourceLabel}>Source link optional</Text>
                <TextInput
                  value={sourceUrl}
                  onChangeText={setSourceUrl}
                  placeholder="https://..."
                  placeholderTextColor="#71717A"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.sourceInput}
                />
              </View>
            )}

            {/* Conversation preview */}
            <Text style={styles.sectionLabel}>The original conversation</Text>
            {snapshot.length > 1 && (
              <Text style={styles.forkHint}>
                Tap any message to branch from that point — everything after it is
                trimmed from your perspective.
              </Text>
            )}

            {snapshot.map((m, idx) => {
              const trimmed = idx >= branchCount;
              const isForkEdge = isPartialBranch && idx === branchCount - 1;
              return (
                <React.Fragment key={idx}>
                  <Animated.View
                    entering={FadeInDown.delay(idx * 40).duration(240)}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '88%',
                      marginBottom: 10,
                      opacity: trimmed ? 0.32 : 1,
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        if (hapticEnabled) void feedbackHaptic('tap');
                        // Tapping the current edge resets to the full conversation.
                        setForkPoint(prev => (prev === idx ? null : idx));
                      }}
                    >
                      {m.role === 'user' ? (
                        <LinearGradient
                          colors={GRADIENTS.remix}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.bubbleUser}
                        >
                          <Text style={styles.bubbleUserText}>{m.content}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={styles.bubbleAi}>
                          <Text style={styles.bubbleAiText}>{m.content}</Text>
                        </View>
                      )}
                    </Pressable>
                  </Animated.View>

                  {isForkEdge && (
                    <View style={styles.forkDivider}>
                      <View style={styles.forkLine} />
                      <View style={styles.forkBadge}>
                        <GitBranch color="#000" size={12} weight="fill" />
                        <Text style={styles.forkBadgeText}>YOUR BRANCH STARTS HERE</Text>
                      </View>
                      <View style={styles.forkLine} />
                    </View>
                  )}
                </React.Fragment>
              );
            })}

            {snapshot.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={{ color: '#A1A1AA', lineHeight: 20 }}>
                  This Echo was published before conversation history was saved. You can still ask a fresh follow-up about it.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Sticky CTA */}
          <View style={styles.ctaWrap}>
            <Pressable onPress={handleStartRemix} disabled={launching}>
              <LinearGradient
                colors={launching ? ['#3F3F46', '#3F3F46'] : GRADIENTS.remix}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.cta, !launching && accentShadow(ACCENT_COLORS.magenta, 'hard')]}
              >
                <PaperPlaneRight color="#000" size={22} weight="fill" />
                <Text style={styles.ctaText}>
                  {launching
                    ? 'Opening…'
                    : isPartialBranch
                      ? `Branch from message ${branchCount}`
                      : 'Add your perspective'}
                </Text>
              </LinearGradient>
            </Pressable>
            <Text style={styles.ctaHint}>
              {isPartialBranch
                ? `Keeping the first ${branchCount} of ${snapshot.length} messages · credits @${parentAuthor}`
                : `Your ${PERSPECTIVE_LABELS[perspectiveType].toLowerCase()} perspective will credit @${parentAuthor}`}
            </Text>
          </View>
        </>
      ) : null}
    </SafeAreaView>
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
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 3,
  },
  hero: {
    borderRadius: 28,
    padding: 22,
    marginBottom: 24,
    overflow: 'hidden',
  },
  heroInner: {
    gap: 4,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heroEyebrow: {
    ...DISPLAY_TYPE.eyebrow,
    color: 'rgba(0,0,0,0.65)',
  },
  heroTitle: {
    ...DISPLAY_TYPE.display,
    color: '#000',
    marginTop: 4,
  },
  heroSub: {
    color: 'rgba(0,0,0,0.78)',
    fontSize: 14,
    lineHeight: 19,
    marginTop: 10,
    fontWeight: '600',
  },
  heroChip: {
    marginTop: 14,
    backgroundColor: 'rgba(0,0,0,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  heroChipText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  sectionLabel: {
    ...DISPLAY_TYPE.eyebrow,
    color: '#71717A',
    marginBottom: 12,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  typeCard: {
    width: '48%',
    minHeight: 96,
    borderRadius: 18,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    padding: 14,
  },
  typeCardActive: {
    borderColor: ACCENT_COLORS.cyan,
    backgroundColor: 'rgba(34,245,255,0.12)',
  },
  typeTitle: {
    color: '#E4E4E7',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 6,
  },
  typeTitleActive: {
    color: ACCENT_COLORS.cyan,
  },
  typeDescription: {
    color: '#A1A1AA',
    fontSize: 12,
    lineHeight: 16,
  },
  sourceWrap: {
    marginTop: -10,
    marginBottom: 24,
  },
  sourceLabel: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sourceInput: {
    color: '#fff',
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  forkHint: {
    color: '#71717A',
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 16,
  },
  forkDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  forkLine: {
    flex: 1,
    height: 1,
    backgroundColor: ACCENT_COLORS.cyan,
    opacity: 0.4,
  },
  forkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: ACCENT_COLORS.cyan,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  forkBadgeText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 9.5,
    letterSpacing: 0.6,
  },
  bubbleUser: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
    borderBottomRightRadius: 6,
  },
  bubbleUserText: {
    color: '#000',
    lineHeight: 21,
    fontSize: 15,
    fontWeight: '700',
  },
  bubbleAi: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
    borderBottomLeftRadius: 6,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  bubbleAiText: {
    color: '#E4E4E7',
    lineHeight: 21,
    fontSize: 15,
  },
  emptyState: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: '#0A0A0F',
    borderTopWidth: 1,
    borderTopColor: '#18181B',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 24,
  },
  ctaText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: 0.2,
  },
  ctaHint: {
    color: '#71717A',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
});
