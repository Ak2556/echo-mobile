import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { VirtualizedThreadList } from './VirtualizedThreadList';
import { VirtualizedChatFeed } from './VirtualizedChatFeed';
import { ChatInput } from './ChatInput';
import { ChatDetailsSidebar } from './ChatDetailsSidebar';
import { useOptimisticChat } from '../../../../hooks/useOptimisticChat';
import { Image } from 'expo-image';
import { Info } from 'phosphor-react-native';

const MOCK_THREADS = [
  { id: 't1', name: 'Alice Cooper', preview: 'See you tomorrow!', unread: true, avatar: 'https://i.pravatar.cc/150?u=alice' },
  { id: 't2', name: 'Design Team', preview: 'I attached the new assets.', unread: false, avatar: 'https://i.pravatar.cc/150?u=design' },
];

export function EchoMessagingLayout({ currentUserId, colors }: { currentUserId: string, colors: any }) {
  const [activeThreadId, setActiveThreadId] = useState<string>('t1');
  const [showDetails, setShowDetails] = useState(true);

  const { messages, sendMessage } = useOptimisticChat(activeThreadId, currentUserId);
  const activeThread = MOCK_THREADS.find(t => t.id === activeThreadId);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <VirtualizedThreadList 
        threads={MOCK_THREADS} 
        onSelect={setActiveThreadId} 
        colors={colors}
      />
      
      <View style={styles.centerPane}>
        {activeThread ? (
          <>
            <View style={[styles.chatHeader, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
              <View style={styles.headerLeft}>
                <View style={styles.headerAvatarContainer}>
                  <Image source={activeThread.avatar} style={styles.headerAvatar} />
                </View>
                <Text style={[styles.headerName, { color: colors.text }]}>{activeThread.name}</Text>
              </View>
              <TouchableOpacity 
                style={styles.headerAction}
                onPress={() => setShowDetails(!showDetails)}
              >
                <Info size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.chatCanvas}>
              <VirtualizedChatFeed messages={messages} currentUserId={currentUserId} colors={colors} />
              <ChatInput onSend={sendMessage} colors={colors} />
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={{ color: colors.textMuted }}>Select a conversation to start messaging</Text>
          </View>
        )}
      </View>

      {showDetails && activeThread && (
        <ChatDetailsSidebar 
          recipient={{ name: activeThread.name, handle: activeThread.name.toLowerCase().replace(' ', ''), avatar: activeThread.avatar }} 
          colors={colors}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  centerPane: {
    flex: 1,
    flexDirection: 'column',
  },
  chatHeader: {
    height: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerAvatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    overflow: 'hidden',
  },
  headerAvatar: {
    width: '100%',
    height: '100%',
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerAction: {
    padding: 8,
  },
  chatCanvas: {
    flex: 1,
    flexDirection: 'column',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
