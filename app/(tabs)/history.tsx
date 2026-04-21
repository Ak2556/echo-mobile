// @ts-nocheck
import React from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { ChatTeardropDots, Trash, Plus, Clock } from 'phosphor-react-native';
import { useAppStore } from '../../store/useAppStore';
import { EmptyState } from '../../components/common/EmptyState';
import { ChatSession } from '../../types';

function SessionCard({ session, index, onPress, onDelete }: {
  session: ChatSession; index: number; onPress: () => void; onDelete: () => void;
}) {
  const timeAgo = getTimeAgo(session.updatedAt);

  return (
    <Animated.View entering={FadeInRight.delay(index * 60).springify()}>
      <Pressable
        onPress={onPress}
        onLongPress={() => {
          Alert.alert('Delete Chat', 'Are you sure you want to delete this conversation?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
          ]);
        }}
        className="bg-zinc-900 mx-4 my-1.5 p-4 rounded-2xl border border-zinc-800 flex-row items-center"
      >
        <View className="w-10 h-10 rounded-xl bg-zinc-800 items-center justify-center mr-3">
          <ChatTeardropDots color="#3B82F6" size={20} />
        </View>
        <View className="flex-1">
          <Text className="text-white font-semibold text-base" numberOfLines={1}>{session.title}</Text>
          {session.lastMessage ? (
            <Text className="text-zinc-400 text-sm mt-1" numberOfLines={1}>{session.lastMessage}</Text>
          ) : null}
        </View>
        <View className="items-end ml-2">
          <Text className="text-zinc-500 text-xs">{timeAgo}</Text>
          <Text className="text-zinc-600 text-xs mt-1">{session.messageCount} msgs</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const { sessions, createSession, deleteSession, setCurrentSessionId } = useAppStore();

  const handleNewChat = () => {
    const id = createSession();
    setCurrentSessionId(id);
    router.push('/(tabs)/chat');
  };

  const handleOpenSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    router.push('/(tabs)/chat');
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="px-4 py-3 flex-row items-center justify-between border-b border-zinc-900">
        <Text className="text-white text-2xl font-bold">History</Text>
        <Pressable onPress={handleNewChat} className="bg-blue-600 p-2.5 rounded-xl">
          <Plus color="#fff" size={20} />
        </Pressable>
      </View>

      {sessions.length === 0 ? (
        <EmptyState
          icon={<Clock color="#6366F1" size={32} />}
          title="No conversations yet"
          subtitle="Start chatting with Echo and your conversations will appear here."
          actionLabel="Start Chatting"
          onAction={handleNewChat}
        />
      ) : (
        <FlashList
          data={sessions}
          renderItem={({ item, index }) => (
            <SessionCard
              session={item}
              index={index}
              onPress={() => handleOpenSession(item)}
              onDelete={() => deleteSession(item.id)}
            />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
        />
      )}
    </SafeAreaView>
  );
}
