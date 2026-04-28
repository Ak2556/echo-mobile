import React, { useRef } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Message, MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const listRef = useRef<FlashList<Message>>(null);

  return (
    <View className="flex-1 w-full bg-black">
      <FlashList
        ref={listRef}
        data={messages}
        renderItem={({ item }: { item: Message }) => <MessageBubble message={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 16 }}
      />
    </View>
  );
}
