import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, PaperPlaneTilt, ChatCircle, X } from 'phosphor-react-native';
import { TextInput } from '../../components/ui/TextInput';
import { CommentCard } from '../../components/social/CommentCard';
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

  const { getComments, addComment, username, displayName, avatarColor } = useAppStore();
  const [text, setText] = useState('');
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
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18, flex: 1 }}>Comments</Text>
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

        {replyingTo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface, borderTopWidth: 0.5, borderTopColor: colors.border }}>
            <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>Replying to @{replyingTo.username}</Text>
            <Pressable onPress={() => setReplyingTo(null)} hitSlop={10}>
              <X color={colors.textMuted} size={16} />
            </Pressable>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
          <View
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: avatarColor }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
              {(username || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1 mr-2">
            <TextInput
              placeholder={replyingTo ? `Reply to @${replyingTo.username}…` : 'Add a comment...'}
              value={text}
              onChangeText={setText}
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
