// @ts-nocheck
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, PenSquare, Mail } from 'lucide-react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { BadgeCheck } from 'lucide-react-native';
import { EmptyState } from '../../components/common/EmptyState';
import { useAppStore } from '../../store/useAppStore';
import { Conversation } from '../../types';

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

function ConversationCard({ conversation, index, onPress }: {
  conversation: Conversation; index: number; onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeInRight.delay(index * 50).springify()}>
      <Pressable onPress={onPress} className="flex-row items-center px-4 py-3.5 border-b border-zinc-900">
        {/* Avatar */}
        <View className="relative">
          <View
            className="w-12 h-12 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: conversation.avatarColor }}
          >
            <Text className="text-white font-bold text-lg">
              {conversation.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          {conversation.unreadCount > 0 && (
            <View className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-blue-500 items-center justify-center border-2 border-black">
              <Text className="text-white text-[9px] font-bold">{conversation.unreadCount}</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View className="flex-1">
          <View className="flex-row items-center gap-1">
            <Text className={`font-semibold text-base ${conversation.unreadCount > 0 ? 'text-white' : 'text-zinc-300'}`}>
              {conversation.displayName}
            </Text>
            {conversation.isVerified && <BadgeCheck color="#3B82F6" size={14} fill="#3B82F6" />}
          </View>
          <Text
            className={`text-sm mt-0.5 ${conversation.unreadCount > 0 ? 'text-zinc-300 font-medium' : 'text-zinc-500'}`}
            numberOfLines={1}
          >
            {conversation.lastMessage}
          </Text>
        </View>

        {/* Time */}
        <Text className="text-zinc-600 text-xs ml-2">{getTimeAgo(conversation.lastMessageAt)}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function MessagesListScreen() {
  const router = useRouter();
  const { conversations } = useAppStore();

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <Text className="text-white font-bold text-lg">Messages</Text>
        <Pressable className="p-1">
          <PenSquare color="#3B82F6" size={22} />
        </Pressable>
      </View>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No messages yet"
          subtitle="Start a conversation by visiting someone's profile and tapping the message button."
        />
      ) : (
        <FlashList
          data={sorted}
          renderItem={({ item, index }) => (
            <ConversationCard
              conversation={item}
              index={index}
              onPress={() => router.push(`/messages/${item.id}`)}
            />
          )}
          keyExtractor={item => item.id}
        />
      )}
    </SafeAreaView>
  );
}
