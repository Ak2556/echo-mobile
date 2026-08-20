import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Message } from '../../../../hooks/useOptimisticChat';

interface Props {
  messages: Message[];
  currentUserId: string;
  colors: any;
}

export function VirtualizedChatFeed({ messages, currentUserId, colors }: Props) {
  const flashListRef = useRef<any>(null);

  useEffect(() => {
    if (messages.length > 0 && flashListRef.current) {
      setTimeout(() => {
        flashListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const renderItem = ({ item }: { item: Message }) => {
    const isSender = item.sender_id === currentUserId;

    return (
      <View style={[styles.messageRow, isSender ? styles.messageRowSender : styles.messageRowRecipient]}>
        <View 
          style={[
            styles.messageBubble, 
            isSender 
              ? [styles.bubbleSender, { backgroundColor: colors.isDark ? '#27272a' : '#ccfbf1' }] 
              : [styles.bubbleRecipient, { backgroundColor: colors.isDark ? '#3f3f46' : '#f4f4f5' }],
            item.pending && styles.bubblePending,
            item.failed && styles.bubbleFailed
          ]}
        >
          <Text style={[
            styles.messageText, 
            isSender 
              ? { color: colors.isDark ? '#f4f4f5' : '#0f766e' } 
              : { color: colors.isDark ? '#f4f4f5' : '#18181b' }
          ]}>
            {item.text}
          </Text>
          {item.failed && <Text style={styles.failedText}>Failed to send.</Text>}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlashList
        ref={flashListRef}
        data={messages}
        renderItem={renderItem}
        // @ts-ignore
        estimatedItemSize={60}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  messageRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 16,
  },
  messageRowSender: {
    justifyContent: 'flex-end',
  },
  messageRowRecipient: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
  },
  bubbleSender: {
    borderBottomRightRadius: 4,
  },
  bubbleRecipient: {
    borderBottomLeftRadius: 4,
  },
  bubblePending: {
    opacity: 0.7,
  },
  bubbleFailed: {
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  failedText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
});
