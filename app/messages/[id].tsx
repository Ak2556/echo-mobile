// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, FlatList, TextInput as RNTextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, PaperPlaneTilt, Quote, SealCheck, Sparkle } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useRemoteMessages, useSendRemoteDM } from '../../hooks/queries/useDMs';

function EchoShareCard({ title, preview, author }: { title: string; preview: string; author?: string }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ maxWidth: '80%', padding: 12, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Quote color={colors.accent} size={15} />
        <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{title}</Text>
      </View>
      <Text style={{ color: colors.textSecondary, lineHeight: 20 }} numberOfLines={3}>{preview}</Text>
      {author ? <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 12 }}>From {author}</Text> : null}
    </View>
  );
}

function DMBubble({ message, isMe, showReadReceipt }: { message: any; isMe: boolean; showReadReceipt: boolean }) {
  const fontSizeSetting = useAppStore(s => s.fontSize);
  const { colors, radius } = useTheme();
  const textSize = { small: 14, medium: 16, large: 18 }[fontSizeSetting];

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
      <View style={{ maxWidth: '80%' }}>
        {message.content ? (
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderRadius: radius.card,
              backgroundColor: isMe ? colors.accent : colors.surface,
              borderWidth: isMe ? 0 : 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: isMe ? '#fff' : colors.text, fontSize: textSize, lineHeight: textSize * 1.35 }}>{message.content}</Text>
          </View>
        ) : null}
        {message.sharedEchoTitle ? (
          <EchoShareCard
            title={message.sharedEchoTitle}
            preview={message.sharedEchoPreview || ''}
            author={message.sharedEchoAuthor}
          />
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginHorizontal: 4 }}>
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {isMe && showReadReceipt && message.isRead ? <Text style={{ color: colors.accent, fontSize: 10 }}>Read</Text> : null}
      </View>
    </View>
  );
}

export default function DMScreen() {
  const { id, echoId, echoTitle, echoPreview, echoAuthor } = useLocalSearchParams<{ id: string; echoId?: string; echoTitle?: string; echoPreview?: string; echoAuthor?: string }>();
  const router = useRouter();
  const { conversations, getDMs, sendDM, markConversationRead, shareEchoInDM } = useAppStore();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const readReceipts = useAppStore(s => s.readReceipts);
  const { colors, radius, isUserOnline } = useTheme();
  const [text, setText] = useState('');
  const [sharedPending, setSharedPending] = useState(Boolean(echoId));
  const [quickAction, setQuickAction] = useState<'followup' | 'summary' | 'draft' | null>(null);
  const listRef = useRef<FlatList>(null);

  const remote = isSupabaseRemote();
  const conversation = conversations.find(c => c.id === id);

  // Remote message stream — only active when remote flag is on
  const { data: remoteMessagePages } = useRemoteMessages(remote ? id : undefined);
  const remoteMessages = remoteMessagePages?.pages.flat() ?? [];
  const sendRemote = useSendRemoteDM(id, conversation?.userId);

  // Resolve messages: remote DB or local Zustand
  const localMessages = id ? getDMs(id) : [];
  const messages = remote && remoteMessages.length > 0
    ? remoteMessages.map(m => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content ?? '',
        createdAt: m.createdAt,
        isRead: !!m.readAt,
      }))
    : localMessages;

  const online = conversation ? isUserOnline(conversation.userId) : false;
  const quickStarter = useMemo(() => {
    if (quickAction === 'followup') return 'Curious what part of this stood out to you most?';
    if (quickAction === 'summary') return 'My short take: this Echo felt especially useful because ';
    if (quickAction === 'draft') return 'This could probably turn into a follow-up Echo about ';
    return '';
  }, [quickAction]);

  useEffect(() => {
    if (id) markConversationRead(id);
  }, [id, markConversationRead]);

  useEffect(() => {
    if (!id || !echoId || !echoTitle || !sharedPending) return;
    shareEchoInDM(id, {
      id: String(echoId),
      userId: conversation?.userId || '',
      username: conversation?.username || '',
      displayName: conversation?.displayName || '',
      avatarColor: conversation?.avatarColor || colors.accent,
      isVerified: !!conversation?.isVerified,
      prompt: String(echoTitle),
      response: String(echoPreview || ''),
      likes: 0,
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      repostCount: 0,
      commentCount: 0,
      viewCount: 0,
      hashtags: [],
      createdAt: new Date().toISOString(),
      editorialTitle: String(echoTitle),
      authorNote: String(echoPreview || ''),
    }, `Thought you'd like this Echo from ${echoAuthor || conversation?.displayName || 'Echo'}.`);
    setSharedPending(false);
  }, [colors.accent, conversation, echoAuthor, echoId, echoPreview, echoTitle, id, shareEchoInDM, sharedPending]);

  const handleSend = () => {
    if (!text.trim() || !id) return;
    if (hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const content = text.trim();
    setText('');
    setQuickAction(null);
    if (remote) {
      sendRemote.mutate({ content });
    } else {
      sendDM(id, content);
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  if (!conversation) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>Conversation not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: conversation.avatarColor, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{conversation.displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{conversation.displayName}</Text>
            {conversation.isVerified ? <SealCheck color={colors.accent} size={14} weight="fill" /> : null}
          </View>
          <Text style={{ color: online ? colors.success : colors.textMuted, fontSize: 12 }}>
            {online ? 'Online now' : `@${conversation.username}`}
          </Text>
        </View>
      </View>

      {echoTitle && sharedPending ? null : echoTitle ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Sparkle color={colors.accent} size={15} />
            <Text style={{ color: colors.text, fontWeight: '700' }}>Messaging about an Echo</Text>
          </View>
          <Text style={{ color: colors.textSecondary, lineHeight: 20 }} numberOfLines={2}>
            Keep the conversation about what was useful, surprising, or worth building on.
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={({ item }) => <DMBubble message={item} isMe={item.senderId === 'me'} showReadReceipt={readReceipts} />}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingVertical: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {[
              { key: 'followup', label: 'Suggest follow-up' },
              { key: 'summary', label: 'Add your take' },
              { key: 'draft', label: 'Turn into draft' },
            ].map(item => (
              <Pressable
                key={item.key}
                onPress={() => {
                  setQuickAction(item.key as any);
                  setText(quickStarter && quickAction === item.key ? quickStarter : (
                    item.key === 'followup'
                      ? 'Curious what part of this stood out to you most?'
                      : item.key === 'summary'
                        ? 'My short take: this Echo felt especially useful because '
                        : 'This could probably turn into a follow-up Echo about '
                  ));
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: quickAction === item.key ? colors.accent : colors.border }}
              >
                <Text style={{ color: quickAction === item.key ? colors.accent : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View style={{ flex: 1, marginRight: 10, minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.card }}>
            <RNTextInput
              style={{ color: colors.text, fontSize: 16, lineHeight: 20 }}
              placeholder="Reply with context..."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
            />
          </View>
          <AnimatedPressable onPress={handleSend} disabled={!text.trim()} style={{ padding: 13, borderRadius: 999, backgroundColor: text.trim() ? colors.accent : colors.surfaceHover }}>
            <PaperPlaneTilt color="#fff" size={18} />
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
