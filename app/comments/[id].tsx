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
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-black">
      <View className="flex-row items-center px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1 mr-3" accessibilityLabel="Go back" accessibilityRole="button">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <Text className="text-white font-bold text-lg flex-1">Comments</Text>
        <Text className="text-zinc-500 text-sm">{comments.length}</Text>
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

        <View className="flex-row items-end px-4 py-3 border-t border-zinc-900 bg-black">
          <View
            className="w-8 h-8 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: avatarColor }}
          >
            <Text className="text-white font-bold text-xs">
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
