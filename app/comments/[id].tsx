import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, PaperPlaneTilt, ChatCircle, X, ArrowBendUpLeft } from 'phosphor-react-native';
import { TextInput } from '../../components/ui/TextInput';
import { Avatar } from '../../components/ui/Avatar';
import { CommentCard } from '../../components/social/CommentCard';
import { MentionSuggestions, applyMentionPick } from '../../components/social/MentionSuggestions';
import { EmptyState } from '../../components/common/EmptyState';
import { useAppStore } from '../../store/useAppStore';
import { Comment } from '../../types';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useEchoComments, useAddRemoteComment } from '../../hooks/queries/useEchoComments';
import { useTheme } from '../../lib/theme';

interface ThreadedRow {
  comment: Comment;
  indented: boolean;
}

export default function CommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const remote = isSupabaseRemote();
  const remoteQ = useEchoComments(remote ? id : undefined);
  const addRemote = useAddRemoteComment(remote ? id : undefined);
  const { colors } = useTheme();

  const { getComments, addComment, username, displayName, avatarColor, avatarUrl } = useAppStore();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  const loadingRemote = remote && remoteQ.isPending;
  const comments = useMemo<Comment[]>(
    () => remote ? (remoteQ.data ?? []) : (!remote && id ? getComments(id) : []),
    [remote, remoteQ.data, id, getComments],
  );

  // Group: roots first, then their direct children below.
  const threadedRows = useMemo<ThreadedRow[]>(() => {
    const byParent = new Map<string, Comment[]>();
    const roots: Comment[] = [];
    for (const c of comments) {
      if (c.parentId) {
        const arr = byParent.get(c.parentId) ?? [];
        arr.push(c);
        byParent.set(c.parentId, arr);
      } else {
        roots.push(c);
      }
    }
    const out: ThreadedRow[] = [];
    for (const r of roots) {
      out.push({ comment: r, indented: false });
      const kids = byParent.get(r.id) ?? [];
      for (const k of kids) out.push({ comment: k, indented: true });
    }
    return out;
  }, [comments]);

  const handleSend = async () => {
    if (!text.trim() || !id) return;
    const parentId = replyingTo?.id;
    if (remote) {
      try {
        await addRemote.mutateAsync({ content: text.trim(), parentId });
        setText('');
        setReplyingTo(null);
      } catch (e) {
        Alert.alert('Could not post', (e as Error).message);
      }
      return;
    }
    const comment: Comment = {
      id: Date.now().toString(),
      echoId: id,
      userId: 'me',
      username,
      displayName: displayName || username,
      avatarColor,
      isVerified: false,
      content: text.trim(),
      likes: 0,
      isLiked: false,
      replyCount: 0,
      parentId,
      createdAt: new Date().toISOString(),
    };
    addComment(id, comment);
    setText('');
    setReplyingTo(null);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }} accessibilityLabel="Go back" accessibilityRole="button">
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 20, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4, flex: 1 }}>Comments</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>{comments.length}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loadingRemote ? (
          <View className="flex-1 items-center justify-center pt-20">
            <ActivityIndicator color="#3B82F6" size="large" />
          </View>
        ) : threadedRows.length === 0 ? (
          <EmptyState
            icon={<ChatCircle color="#6366F1" size={32} />}
            title="No comments yet"
            subtitle="Be the first to share your thoughts on this echo."
          />
        ) : (
          <FlashList
            data={threadedRows}
            renderItem={({ item }) => (
              <CommentCard
                comment={item.comment}
                echoId={id!}
                indented={item.indented}
                onReply={(c) => setReplyingTo(c)}
              />
            )}
            keyExtractor={item => item.comment.id}
            contentContainerStyle={{ paddingVertical: 8 }}
            refreshControl={
              remote ? (
                <RefreshControl
                  refreshing={remoteQ.isFetching}
                  onRefresh={() => remoteQ.refetch()}
                  tintColor={colors.accent}
                />
              ) : undefined
            }
          />
        )}

        {inputFocused && (
          <MentionSuggestions
            text={text}
            caret={caret}
            bottom={replyingTo ? 110 : 78}
            onPick={(u) => {
              const { text: nt } = applyMentionPick(text, caret, u.username);
              setText(nt);
              setCaret(nt.length);
            }}
          />
        )}

        {replyingTo && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: colors.accentMuted,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
          }}>
            <ArrowBendUpLeft color={colors.accent} size={16} weight="bold" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>
                Replying to
              </Text>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 1 }} numberOfLines={1}>
                @{replyingTo.username}
                <Text style={{ color: colors.textMuted, fontWeight: '400' }}>
                  {'  '}· {replyingTo.content.slice(0, 60)}{replyingTo.content.length > 60 ? '…' : ''}
                </Text>
              </Text>
            </View>
            <Pressable
              onPress={() => setReplyingTo(null)}
              hitSlop={10}
              style={{ padding: 6, borderRadius: 999, backgroundColor: colors.surface }}
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
            >
              <X color={colors.textSecondary} size={14} weight="bold" />
            </Pressable>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
          <View style={{ marginRight: 8 }}>
            <Avatar name={username || '?'} color={avatarColor} url={avatarUrl} size={32} />
          </View>
          <View className="flex-1 mr-2">
            <TextInput
              placeholder={replyingTo ? `Reply to @${replyingTo.username}…` : 'Add a comment...'}
              value={text}
              onChangeText={setText}
              onSelectionChange={e => setCaret(e.nativeEvent.selection.start)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              maxLength={500}
            />
          </View>
          <Pressable
            onPress={() => { void handleSend(); }}
            disabled={!text.trim() || addRemote.isPending}
            className={`p-2.5 rounded-full ${text.trim() && !addRemote.isPending ? 'bg-blue-600' : 'bg-zinc-800'}`}
            accessibilityLabel="Send comment"
            accessibilityRole="button"
          >
            <PaperPlaneTilt color="#fff" size={18} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
