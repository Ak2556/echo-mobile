// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, FlatList, TextInput as RNTextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Send, BadgeCheck } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useAppStore } from '../../store/useAppStore';

function DMBubble({ message, isMe }: { message: any; isMe: boolean }) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      className={`px-4 py-1.5 ${isMe ? 'items-end' : 'items-start'}`}
    >
      <View
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isMe ? 'bg-blue-600 rounded-br-sm' : 'bg-zinc-800 rounded-bl-sm'
        }`}
      >
        <Text className="text-white text-base leading-5">{message.content}</Text>
      </View>
      <Text className="text-zinc-600 text-[10px] mt-1 mx-1">
        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </Animated.View>
  );
}

export default function DMScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { conversations, getDMs, sendDM, markConversationRead } = useAppStore();
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  const conversation = conversations.find(c => c.id === id);
  const messages = id ? getDMs(id) : [];

  useEffect(() => {
    if (id) markConversationRead(id);
  }, [id]);

  const handleSend = () => {
    if (!text.trim() || !id) return;
    sendDM(id, text.trim());
    setText('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  if (!conversation) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center">
        <Text className="text-zinc-400">Conversation not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <View
          className="w-9 h-9 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: conversation.avatarColor }}
        >
          <Text className="text-white font-bold text-sm">
            {conversation.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-1">
            <Text className="text-white font-bold text-base">{conversation.displayName}</Text>
            {conversation.isVerified && <BadgeCheck color="#3B82F6" size={14} fill="#3B82F6" />}
          </View>
          <Text className="text-zinc-500 text-xs">@{conversation.username}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={({ item }) => (
            <DMBubble message={item} isMe={item.senderId === 'me'} />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingVertical: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input */}
        <View className="flex-row items-end px-4 py-3 border-t border-zinc-900">
          <View className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 mr-2 min-h-[44px] justify-center">
            <RNTextInput
              className="text-white text-base leading-5"
              placeholder="Message..."
              placeholderTextColor="#71717A"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!text.trim()}
            className={`p-3 rounded-full mb-0.5 ${text.trim() ? 'bg-blue-600' : 'bg-zinc-800'}`}
          >
            <Send color="#fff" size={18} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
