import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, GitBranch, PaperPlaneRight, Sparkle } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { fetchRemoteEchoById, fetchEchoConversationSnapshot } from '../../lib/supabaseEchoApi';
import { setPendingPublishContext } from '../../lib/publishContext';
import { GRADIENTS, NEON, TYPE, neonGlow, neonHaptic } from '../../lib/neonDesign';
import type { ChatMessage } from '../../types';

/**
 * Remix entry screen — 2026 aesthetic.
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

  const handleStartRemix = () => {
    if (!parent) return;
    if (hapticEnabled) void neonHaptic('remix');
    setLaunching(true);
    const titleSource =
      parent.editorialTitle || (parentTitle ? String(parentTitle) : '') || parent.prompt.slice(0, 40) || 'Remix';
    const sessionId = createSession(`Remix · ${titleSource}`.slice(0, 60));
    const seeded: ChatMessage[] = snapshot.map((m, idx) => ({
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
    });
    router.replace('/(tabs)/chat');
  };

  const isLoading = echoQuery.isLoading || snapshotQuery.isLoading;
  const hasError = echoQuery.isError || (!isLoading && !parent);

  useEffect(() => {
    if (snapshotQuery.isError) {
      Alert.alert('Could not load conversation', 'This Echo can\'t be remixed right now.');
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
          <GitBranch color={NEON.cyan} size={18} weight="fill" />
          <Text style={styles.headerTitle}>REMIX</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={NEON.cyan} size="large" />
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
            {/* Hero banner — gradient + glow */}
            <Animated.View entering={FadeInDown.duration(280)}>
              <LinearGradient
                colors={GRADIENTS.remix}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.hero, neonGlow(NEON.violet, 'med')]}
              >
                <View style={styles.heroInner}>
                  <View style={styles.heroIconWrap}>
                    <Sparkle color="#000" size={26} weight="fill" />
                  </View>
                  <Text style={styles.heroEyebrow}>YOU&apos;RE BRANCHING OFF</Text>
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    @{parentAuthor}&apos;s Echo
                  </Text>
                  <Text style={styles.heroSub}>
                    Ask Gemini a follow-up. Take it somewhere unexpected. Your remix gets linked back.
                  </Text>
                  {parentRemixCount > 0 && (
                    <View style={styles.heroChip}>
                      <GitBranch color="#000" size={12} weight="fill" />
                      <Text style={styles.heroChipText}>
                        {parentRemixCount} {parentRemixCount === 1 ? 'remix' : 'remixes'} already
                      </Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
            </Animated.View>

            {/* Conversation preview */}
            <Text style={styles.sectionLabel}>The original conversation</Text>

            {snapshot.map((m, idx) => (
              <Animated.View
                key={idx}
                entering={FadeInDown.delay(idx * 40).duration(240)}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  marginBottom: 10,
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
              </Animated.View>
            ))}

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
                style={[styles.cta, !launching && neonGlow(NEON.magenta, 'hard')]}
              >
                <PaperPlaneRight color="#000" size={22} weight="fill" />
                <Text style={styles.ctaText}>
                  {launching ? 'Opening…' : 'Continue the conversation'}
                </Text>
              </LinearGradient>
            </Pressable>
            <Text style={styles.ctaHint}>
              Your remix will credit @{parentAuthor} as the source ✨
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
    ...TYPE.eyebrow,
    color: 'rgba(0,0,0,0.65)',
  },
  heroTitle: {
    ...TYPE.display,
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
    ...TYPE.eyebrow,
    color: '#71717A',
    marginBottom: 12,
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
