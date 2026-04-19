import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageList } from '../components/ai/MessageList';
import { ChatInput } from '../components/ai/ChatInput';
import { Message } from '../components/ai/MessageBubble';
import { useChatStream } from '../hooks/queries/useChatStream';

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Hello. I am Echo. How can I assist you today?' }
  ]);

  const chatMutation = useChatStream();

  const handleSend = (text: string) => {
    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const tempAiId = (Date.now() + 1).toString();
    const tempAiMsg: Message = { id: tempAiId, role: 'assistant', content: '...' };
    
    setMessages(prev => [...prev, newUserMsg, tempAiMsg]);

    chatMutation.mutate({
      message: text,
      onChunk: (chunk: string) => {
        setMessages(prev => prev.map(m => m.id === tempAiId ? { ...m, content: chunk } : m));
      }
    }, {
      onError: (error) => {
        setMessages(prev => prev.map(m => m.id === tempAiId ? { ...m, content: 'Error connecting to the backend.' } : m));
      }
    });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-black">
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <MessageList messages={messages} />
        <ChatInput onSend={handleSend} isLoading={chatMutation.isPending} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
