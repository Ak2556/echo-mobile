import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MessageList } from '../../components/ai/MessageList';
import { ChatInput } from '../../components/ai/ChatInput';
import { Message } from '../../components/ai/MessageBubble';
import { useChatStream } from '../../hooks/queries/useChatStream';
import { useAppStore } from '../../store/useAppStore';
import { Share2, Plus, Sparkles, Clock } from 'lucide-react-native';

export default function ChatScreen() {
  const router = useRouter();
  const {
    currentSessionId, createSession, setCurrentSessionId,
    getMessages, addMessage, updateMessage,
    updateSessionLastMessage, updateSessionTitle,
  } = useAppStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const sessionIdRef = useRef(currentSessionId);

  // Initialize session
  useEffect(() => {
    if (!currentSessionId) {
      const id = createSession();
      sessionIdRef.current = id;
    } else {
      sessionIdRef.current = currentSessionId;
      // Load existing messages
      const existing = getMessages(currentSessionId);
      if (existing.length > 0) {
        setMessages(existing.map(m => ({ id: m.id, role: m.role, content: m.content })));
      }
    }
  }, [currentSessionId]);

  // Add welcome message if empty
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ id: 'welcome', role: 'assistant', content: 'Hello! I\'m Echo. How can I help you today?' }]);
    }
  }, []);

  const chatMutation = useChatStream();

  const handleSend = useCallback((text: string) => {
    const sid = sessionIdRef.current || currentSessionId;
    if (!sid) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const aiId = (Date.now() + 1).toString();
    const aiMsg: Message = { id: aiId, role: 'assistant', content: '...' };

    setMessages(prev => [...prev.filter(m => m.id !== 'welcome'), userMsg, aiMsg]);

    // Persist user message
    addMessage(sid, { id: userMsg.id, role: 'user', content: text, createdAt: new Date().toISOString() });

    // Auto-title on first message
    const currentMsgs = getMessages(sid);
    if (currentMsgs.length <= 1) {
      updateSessionTitle(sid, text.slice(0, 40) + (text.length > 40 ? '...' : ''));
    }

    chatMutation.mutate({
      message: text,
      onChunk: (chunk: string) => {
        setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: chunk } : m));
      }
    }, {
      onSuccess: (result: any) => {
        const finalContent = result?.content || 'Response received.';
        // Persist AI message
        addMessage(sid, { id: aiId, role: 'assistant', content: finalContent, createdAt: new Date().toISOString() });
        updateSessionLastMessage(sid, finalContent.slice(0, 60), getMessages(sid).length);
      },
      onError: () => {
        setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: 'Sorry, I couldn\'t connect to the server. Please try again.' } : m));
      }
    });
  }, [currentSessionId]);

  const handleNewChat = () => {
    const id = createSession();
    sessionIdRef.current = id;
    setMessages([{ id: 'welcome', role: 'assistant', content: 'Hello! I\'m Echo. How can I help you today?' }]);
  };

  const handleShare = () => {
    // Find last user/assistant pair
    const userMsgs = messages.filter(m => m.role === 'user');
    const aiMsgs = messages.filter(m => m.role === 'assistant' && m.id !== 'welcome');
    if (userMsgs.length === 0 || aiMsgs.length === 0) {
      Alert.alert('Nothing to share', 'Have a conversation first, then share it.');
      return;
    }
    const lastUser = userMsgs[userMsgs.length - 1];
    const lastAi = aiMsgs[aiMsgs.length - 1];
    router.push({
      pathname: '/share',
      params: { prompt: lastUser.content, response: lastAi.content },
    });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-zinc-900">
        <View className="flex-row items-center gap-1.5">
          <Pressable onPress={() => router.push('/(tabs)/history')} className="p-1.5 rounded-lg bg-zinc-900">
            <Clock color="#A1A1AA" size={20} />
          </Pressable>
          <Pressable onPress={handleNewChat} className="p-1.5 rounded-lg bg-zinc-900">
            <Plus color="#A1A1AA" size={20} />
          </Pressable>
        </View>
        <View className="flex-row items-center absolute left-0 right-0 justify-center pointer-events-none">
          <Sparkles color="#3B82F6" size={18} />
          <Text className="text-white font-bold text-lg ml-2">Echo</Text>
        </View>
        <Pressable onPress={handleShare} className="p-1.5 rounded-lg bg-zinc-900 z-10">
          <Share2 color="#A1A1AA" size={20} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <MessageList messages={messages} />
        <ChatInput onSend={handleSend} isLoading={chatMutation.isPending} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
