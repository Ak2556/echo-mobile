import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { PaperPlaneTilt, ChatCircle, X, ArrowBendUpLeft } from 'phosphor-react-native';
import { TextInput } from '../../../../components/ui/TextInput';
import { Avatar } from '../../../../components/ui/Avatar';
import { CommentCard } from './CommentCard';
import { MentionSuggestions, applyMentionPick } from './MentionSuggestions';
import { EmptyState } from '../../../../components/common/EmptyState';
import { useAppStore } from '../../../../store/useAppStore';
import { Comment } from '../../../../types';
import { isSupabaseRemote } from '../../../../lib/remoteConfig';
import { useEchoComments, useAddRemoteComment } from '../../../../hooks/queries/useEchoComments';
import { useTheme } from '../../../shared/lib/theme';
import { ttx } from '../../../shared/lib/i18n';

/**
 * The comment list and composer, with no opinion about how it is presented.
 *
 * Extracted from app/comments/[id].tsx so the full-screen route and the sheet
 * that opens over a Flow video are the same code. They were going to be two
 * copies of a threading model, a mention picker and a reply affordance, and the
 * copies would have drifted the first time either was touched.
 *
 * The host supplies the chrome: the route keeps its header, the sheet keeps its
 * grabber and backdrop.
 */

interface ThreadedRow {
  comment: Comment;
  indented: boolean;
}

interface Props {
  echoId: string | undefined;
  /** Space to leave under the composer — safe-area inset, or sheet padding. */
  bottomInset?: number;
  /** Reported on every change so a host can show the count in its own chrome. */
  onCountChange?: (count: number) => void;
}

export function CommentsPanel({ echoId, bottomInset = 0, onCountChange }: Props) {
  const remote = isSupabaseRemote();
  const remoteQ = useEchoComments(remote ? echoId : undefined);
  const addRemote = useAddRemoteComment(remote ? echoId : undefined);
  const { colors } = useTheme();

  const { getComments, addComment, username, displayName, avatarColor, avatarUrl } = useAppStore();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  const loadingRemote = remote && remoteQ.isPending;
  const comments = useMemo<Comment[]>(
    () => remote ? (remoteQ.data ?? []) : (!remote && echoId ? getComments(echoId) : []),
    [remote, remoteQ.data, echoId, getComments],
  );

  React.useEffect(() => { onCountChange?.(comments.length); }, [comments.length, onCountChange]);

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
    if (!text.trim() || !echoId) return;
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
      echoId,
      userId: 'me',
      username,
      displayName: displayName || username,
      avatarColor,
      avatarUrl,
      isVerified: false,
      content: text.trim(),
      likes: 0,
      isLiked: false,
      replyCount: 0,
      parentId,
      createdAt: new Date().toISOString(),
    };
    addComment(echoId, comment);
    setText('');
    setReplyingTo(null);
  };

  return (
    <View style={{ flex: 1 }}>
      {loadingRemote ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : threadedRows.length === 0 ? (
        <EmptyState
          icon={<ChatCircle color="#6366F1" size={32} />}
          title={ttx("No comments yet")}
          subtitle={ttx("Be the first to share your thoughts on this echo.")}
        />
      ) : (
        <FlashList
          data={threadedRows}
          renderItem={({ item }) => (
            <CommentCard
              comment={item.comment}
              echoId={echoId!}
              indented={item.indented}
              onReply={(c) => setReplyingTo(c)}
            />
          )}
          keyExtractor={item => item.comment.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          keyboardShouldPersistTaps="handled"
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
              {ttx("Replying to")}
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
            accessibilityLabel={ttx("Cancel reply")}
          >
            <X color={colors.textSecondary} size={14} weight="bold" />
          </Pressable>
        </View>
      )}

      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12 + bottomInset,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.bg,
      }}>
        <View style={{ marginRight: 8 }}>
          <Avatar name={username || '?'} color={avatarColor} url={avatarUrl} size={32} />
        </View>
        <View style={{ flex: 1, marginRight: 8 }}>
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
          style={{
            padding: 10,
            borderRadius: 999,
            backgroundColor: text.trim() && !addRemote.isPending ? colors.accent : colors.surface,
          }}
          accessibilityLabel={ttx("Send comment")}
          accessibilityRole="button"
        >
          <PaperPlaneTilt color="#fff" size={18} />
        </Pressable>
      </View>
    </View>
  );
}
