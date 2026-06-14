import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView , ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, CheckCircle, Eye, FloppyDisk, Globe, GitBranch, Lock, MagicWand, PaperPlaneTilt, ShieldCheck } from 'phosphor-react-native';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { FeedItem } from '../types';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { getSessionUserId } from '../lib/supabaseEchoApi';
import { usePublishRemoteEcho } from '../hooks/queries/useSupabaseSocial';
import { coerceFeedItem } from '../lib/localFeedSeed';
import { consumePendingPublishContext, peekPendingPublishContext } from '../lib/publishContext';
import { CelebrationOverlay } from '../components/ui/CelebrationOverlay';
import { TextInput } from '../components/ui/TextInput';
import { XP_REWARDS } from '../lib/retention';
import {
  EDITORIAL_ACTIONS,
  applyEditorialAction,
  buildEditorialTitle,
  evaluatePublishChecklist,
  formatMissingFields,
  inferTopics,
  missingPublishFields,
  summarizeConversationContext,
} from '../lib/echoUX';
import { rewriteEditorial, EditorialAction } from '../lib/editorial';

const SHARE_DRAFT_KEY = 'echo/share-draft';

export default function ShareScreen() {
  const router = useRouter();
  const { prompt, response } = useLocalSearchParams<{ prompt: string; response: string }>();
  const { username, userId, avatarColor, displayName, publishEcho } = useAppStore();
  const { colors, radius } = useTheme();
  const [publishing, setPublishing] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [celebration, setCelebration] = useState<null | { headline: string; subtitle: string; variant: 'remix' | 'evolutions' | 'forYou' | 'achievement' }>(null);
  // Snapshot of context staged by chat/remix screens. Peek (not consume) so the
  // user can leave + return without losing remix lineage; consume only on publish.
  const pendingCtx = useRef(peekPendingPublishContext()).current;
  const [title, setTitle] = useState(() =>
    pendingCtx?.initialTitle || buildEditorialTitle(String(prompt ?? ''), String(response ?? ''))
  );
  const [editedResponse, setEditedResponse] = useState(String(response ?? ''));
  const [authorNote, setAuthorNote] = useState(pendingCtx?.initialAuthorNote ?? '');
  const [tagsRaw, setTagsRaw] = useState(() => inferTopics({
    hashtags: [],
    prompt: String(prompt ?? ''),
    response: String(response ?? ''),
  }).join(', '));
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');
  const remotePublish = usePublishRemoteEcho();
  const remote = isSupabaseRemote();
  const isRemix = !!pendingCtx?.parentEchoId;

  const checklist = useMemo(() => evaluatePublishChecklist({ title, response: editedResponse, authorNote }), [authorNote, editedResponse, title]);
  const checklistItems = [
    { key: 'clarity', label: 'Clear title and takeaway', done: checklist.clarity },
    { key: 'relevance', label: 'Why this matters is visible', done: checklist.relevance },
    { key: 'privacy', label: 'No obvious sensitive details', done: checklist.privacy },
    { key: 'completeness', label: 'Enough context to stand alone', done: checklist.completeness },
  ] as const;

  const handleDraftSave = async () => {
    await AsyncStorage.setItem(SHARE_DRAFT_KEY, JSON.stringify({
      title,
      response: editedResponse,
      authorNote,
      tagsRaw,
      visibility,
      prompt,
    }));
    Alert.alert('Draft saved', 'You can come back and finish this Echo later.');
  };

  const [editorialRunning, setEditorialRunning] = useState<string | null>(null);
  const handleEditorialAction = async (action: string) => {
    const current = editedResponse.trim();
    if (!current) {
      Alert.alert('Nothing to rewrite', 'Add the part worth sharing first, then try an editorial tool.');
      return;
    }
    if (editorialRunning) return;
    setEditorialRunning(action);
    try {
      if (remote) {
        const next = await rewriteEditorial(action as EditorialAction, editedResponse, String(prompt ?? ''));
        setEditedResponse(next);
      } else {
        setEditedResponse(applyEditorialAction(action, editedResponse, String(prompt ?? '')));
      }
    } catch (e) {
      Alert.alert('Rewrite failed', (e as Error).message);
    } finally {
      setEditorialRunning(null);
    }
  };

  const missing = useMemo(
    () => missingPublishFields({ prompt: String(prompt ?? ''), title, response: editedResponse }),
    [prompt, title, editedResponse],
  );
  const canPublish = missing.length === 0 && !publishing;

  const handlePublish = async () => {
    if (missing.length) {
      Alert.alert('Almost there', `Add ${formatMissingFields(missing)} before posting.`);
      return;
    }

    if (!checklist.privacy) {
      Alert.alert('Privacy check', 'Remove emails, phone numbers, or personal details before publishing.');
      return;
    }

    const hashtags = tagsRaw
      .split(/[\s,]+/)
      .map(tag => tag.replace(/^#/, '').trim())
      .filter(Boolean);

    if (remote) {
      const uid = await getSessionUserId();
      if (!uid) {
        Alert.alert('Session required', 'Please finish onboarding so we can save your echo.');
        return;
      }
      setPublishing(true);
      try {
        const ctx = consumePendingPublishContext();
        const isRemixPublish = !!ctx?.parentEchoId;
        await remotePublish.mutateAsync({
          authorId: uid,
          prompt: String(prompt),
          response: editedResponse.trim(),
          title: title.trim() || undefined,
          parentEchoId: ctx?.parentEchoId,
          sourceConversationId: ctx?.sourceConversationId,
          conversationSnapshot: ctx?.conversationSnapshot,
        });
        await AsyncStorage.removeItem(SHARE_DRAFT_KEY);
        // Celebrate first, then route. Overlay calls onDone after ~1.6s.
        const xpDelta = isRemixPublish ? XP_REWARDS.publishRemix : XP_REWARDS.publishEcho;
        setCelebration({
          headline: isRemixPublish ? 'REMIXED!' : 'PUBLISHED!',
          subtitle: `+${xpDelta} XP · It's live in Discover`,
          variant: isRemixPublish ? 'remix' : 'achievement',
        });
      } catch (e) {
        Alert.alert('Could not publish', (e as Error).message);
      } finally {
        setPublishing(false);
      }
      return;
    }

    const echo: FeedItem = coerceFeedItem({
      id: Date.now().toString(),
      userId,
      username: username || 'anonymous',
      displayName: displayName || username || 'anonymous',
      avatarColor,
      isVerified: false,
      prompt: String(prompt),
      response: editedResponse.trim(),
      likes: 0,
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      repostCount: 0,
      commentCount: 0,
      viewCount: 0,
      hashtags,
      createdAt: new Date().toISOString(),
      postOrigin: 'chat',
      topicLabels: hashtags.length ? hashtags : inferTopics({ hashtags: [], prompt: String(prompt), response: editedResponse }),
      editorialTitle: title.trim(),
      authorNote: authorNote.trim() || undefined,
      visibility,
      conversationContext: summarizeConversationContext(String(prompt), editedResponse),
      publishChecklist: checklist,
    });

    setPublishing(true);
    setTimeout(async () => {
      publishEcho(echo);
      await AsyncStorage.removeItem(SHARE_DRAFT_KEY);
      Alert.alert('Published', 'Your Echo is live in Discover.', [
        { text: 'Open Discover', onPress: () => router.replace('/(tabs)/home') },
      ]);
      setPublishing(false);
    }, 200);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {celebration && (
        <CelebrationOverlay
          visible
          headline={celebration.headline}
          subtitle={celebration.subtitle}
          variant={celebration.variant}
          onDone={() => {
            setCelebration(null);
            router.replace('/(tabs)/home');
          }}
        />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Share Echo</Text>
        <Pressable
          onPress={() => { void handlePublish(); }}
          disabled={publishing}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: publishing || !canPublish ? colors.surfaceHover : colors.accent, opacity: !canPublish && !publishing ? 0.6 : 1 }}
        >
          <PaperPlaneTilt color="#fff" size={14} />
          <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>{publishing ? 'Posting…' : 'Post'}</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {isRemix && (
          <View style={{ padding: 14, marginBottom: 14, borderRadius: radius.card, backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <GitBranch color={colors.accent} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                Remixing @{pendingCtx?.parentAuthorUsername ?? 'their'} Echo
              </Text>
              {pendingCtx?.parentTitle && (
                <Text style={{ color: colors.textSecondary, marginTop: 2, fontSize: 12 }} numberOfLines={1}>
                  ↳ {pendingCtx.parentTitle}
                </Text>
              )}
            </View>
          </View>
        )}
        <View style={{ padding: 16, marginBottom: 14, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Original prompt</Text>
          <View style={{ padding: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceHover }}>
            <Text style={{ color: colors.text, lineHeight: 22 }}>{prompt}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <Pressable
            onPress={() => setPreviewMode(false)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.full, backgroundColor: !previewMode ? colors.accent : colors.surface, borderWidth: 1, borderColor: !previewMode ? colors.accent : colors.border }}
          >
            <Text style={{ color: !previewMode ? '#fff' : colors.text, fontWeight: '700' }}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => setPreviewMode(true)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.full, backgroundColor: previewMode ? colors.accent : colors.surface, borderWidth: 1, borderColor: previewMode ? colors.accent : colors.border }}
          >
            <Text style={{ color: previewMode ? '#fff' : colors.text, fontWeight: '700' }}>Preview</Text>
          </Pressable>
        </View>

        {!previewMode ? (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Title</Text>
            <TextInput placeholder="Give this Echo a headline" value={title} onChangeText={setTitle} maxLength={90} />

            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 }}>Editorial tools</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              {EDITORIAL_ACTIONS.map(action => {
                const running = editorialRunning === action.key;
                const disabled = !!editorialRunning && !running;
                return (
                  <Pressable
                    key={action.key}
                    onPress={() => { void handleEditorialAction(action.key); }}
                    disabled={!!editorialRunning}
                    style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.full, backgroundColor: running ? colors.accentMuted : colors.surface, borderWidth: 1, borderColor: running ? colors.accent : colors.border, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: disabled ? 0.5 : 1 }}
                  >
                    {running
                      ? <ActivityIndicator size="small" color={colors.accent} />
                      : <MagicWand color={colors.accent} size={14} />}
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{action.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>The part worth sharing<Text style={{ color: colors.accent }}> *</Text></Text>
            <TextInput
              placeholder="Trim the answer down to the strongest takeaway"
              value={editedResponse}
              onChangeText={setEditedResponse}
              multiline
              maxLength={1600}
            />
            {!editedResponse.trim() && (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                Required — write the takeaway you want to publish.
              </Text>
            )}

            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 }}>Add your framing</Text>
            <TextInput
              placeholder="Why is this worth posting? Add context, opinion, or a takeaway."
              value={authorNote}
              onChangeText={setAuthorNote}
              multiline
              maxLength={220}
            />

            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 }}>Topics</Text>
            <TextInput
              placeholder="AI, product, react-native"
              value={tagsRaw}
              onChangeText={setTagsRaw}
              autoCapitalize="none"
            />

            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 }}>Who can see this</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setVisibility('public')}
                style={{ flex: 1, padding: 14, borderRadius: radius.card, backgroundColor: visibility === 'public' ? colors.accentMuted : colors.surface, borderWidth: 1, borderColor: visibility === 'public' ? colors.accent : colors.border }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Globe color={visibility === 'public' ? colors.accent : colors.textSecondary} size={18} />
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Public</Text>
                </View>
                <Text style={{ color: colors.textSecondary, marginTop: 6, fontSize: 13 }}>Visible in Discover and profiles.</Text>
              </Pressable>
              <Pressable
                onPress={() => setVisibility('followers')}
                style={{ flex: 1, padding: 14, borderRadius: radius.card, backgroundColor: visibility === 'followers' ? colors.accentMuted : colors.surface, borderWidth: 1, borderColor: visibility === 'followers' ? colors.accent : colors.border }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Lock color={visibility === 'followers' ? colors.accent : colors.textSecondary} size={18} />
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Followers</Text>
                </View>
                <Text style={{ color: colors.textSecondary, marginTop: 6, fontSize: 13 }}>A softer first publish option.</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={{ padding: 16, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{title || 'Untitled Echo'}</Text>
                <Text style={{ color: colors.textMuted, marginTop: 4 }}>@{username || 'anonymous'} · {visibility === 'public' ? 'Public' : 'Followers'}</Text>
              </View>
              <Eye color={colors.accent} size={18} />
            </View>
            {authorNote.trim() ? (
              <View style={{ padding: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceHover, marginBottom: 12 }}>
                <Text style={{ color: colors.text, lineHeight: 22 }}>{authorNote.trim()}</Text>
              </View>
            ) : null}
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Prompt</Text>
            <Text style={{ color: colors.text, lineHeight: 22, marginBottom: 14 }}>{prompt}</Text>
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Echo</Text>
            <Text style={{ color: colors.textSecondary, lineHeight: 24 }}>{editedResponse.trim() || 'No response yet.'}</Text>
          </View>
        )}

        <View style={{ padding: 16, marginTop: 18, marginBottom: 14, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ShieldCheck color={colors.accent} size={18} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Before you post</Text>
          </View>
          {checklistItems.map(item => (
            <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <CheckCircle color={item.done ? colors.success : colors.textMuted} size={18} weight={item.done ? 'fill' : 'regular'} />
              <Text style={{ color: item.done ? colors.text : colors.textSecondary, fontSize: 14 }}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => { void handleDraftSave(); }}
            style={{ flex: 1, paddingVertical: 13, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <FloppyDisk color={colors.textSecondary} size={18} />
            <Text style={{ color: colors.text, fontWeight: '700' }}>Save draft</Text>
          </Pressable>
          <Pressable
            onPress={() => { void handlePublish(); }}
            disabled={publishing}
            style={{ flex: 1, paddingVertical: 13, borderRadius: radius.card, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !canPublish && !publishing ? 0.6 : 1 }}
          >
            <PaperPlaneTilt color="#fff" size={18} />
            <Text style={{ color: '#fff', fontWeight: '800' }}>{publishing ? 'Publishing…' : 'Publish'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
