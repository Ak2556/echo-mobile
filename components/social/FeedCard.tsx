import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { LikeButton } from './LikeButton';
import { MessageCircle, Bookmark } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { FeedItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useToggleRemoteBookmark } from '../../hooks/queries/useSupabaseSocial';

interface FeedCardProps {
  item: FeedItem;
  index: number;
  onPress?: () => void;
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

export function FeedCard({ item, index, onPress }: FeedCardProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const remote = isSupabaseRemote();
  const remoteBm = useToggleRemoteBookmark();
  const { isBookmarked, toggleBookmark } = useAppStore();
  const bookmarked = remote ? item.isBookmarked : isBookmarked(item.id);

  const toggleBookmarkPress = () => {
    if (remote) {
      remoteBm.mutate({ echoId: item.id, bookmark: !bookmarked });
      return;
    }
    toggleBookmark(item.id);
    qc.invalidateQueries({ queryKey: ['feed'] });
  };

  const openComments = () => {
    router.push(`/comments/${item.id}`);
  };

  return (
    <Animated.View entering={FadeInUp.delay(index * 80).springify()}>
      <Pressable
        onPress={onPress}
        className="bg-zinc-900 mx-4 my-2 p-4 rounded-2xl border border-zinc-800"
      >
        <View className="flex-row items-center mb-3">
          <View className="w-9 h-9 rounded-full bg-blue-600 items-center justify-center mr-3">
            <Text className="text-white font-bold text-sm">{item.username.charAt(0).toUpperCase()}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-white font-semibold text-base">{item.username}</Text>
          </View>
          <Text className="text-zinc-600 text-xs">{getTimeAgo(item.createdAt)}</Text>
        </View>

        <View className="bg-zinc-800 rounded-xl p-3 mb-3">
          <Text className="text-zinc-400 font-medium text-xs mb-1">Prompt</Text>
          <Text className="text-white text-sm">{item.prompt}</Text>
        </View>

        <View className="mb-4">
          <Text className="text-blue-400 font-medium text-xs mb-1">Echo</Text>
          <Text className="text-zinc-200 leading-6 text-sm" numberOfLines={3}>{item.response}</Text>
        </View>

        <View className="flex-row justify-between items-center border-t border-zinc-800 pt-3">
          <LikeButton echoId={item.id} initialLikes={item.likes} initialLiked={item.isLiked} />
          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                openComments();
              }}
              className="flex-row items-center gap-1.5"
            >
              <MessageCircle color="#71717A" size={18} />
              <Text className="text-zinc-500 text-sm">{item.commentCount || 0}</Text>
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                toggleBookmarkPress();
              }}
            >
              <Bookmark
                color={bookmarked ? '#3B82F6' : '#71717A'}
                size={18}
                fill={bookmarked ? '#3B82F6' : 'transparent'}
              />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
