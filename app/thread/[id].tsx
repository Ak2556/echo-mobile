import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Bookmark, Share2, MessageCircle } from 'lucide-react-native';
import { LikeButton } from '../../components/social/LikeButton';
import { useAppStore } from '../../store/useAppStore';
import { useFeed } from '../../hooks/queries/useFeed';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useToggleRemoteBookmark } from '../../hooks/queries/useSupabaseSocial';

export default function ThreadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const remote = isSupabaseRemote();
  const { data: feed } = useFeed();
  const { isBookmarked, toggleBookmark } = useAppStore();
  const remoteBm = useToggleRemoteBookmark();

  const item = feed?.find(f => f.id === id);
  const bookmarked = remote
    ? !!item?.isBookmarked
    : id
      ? isBookmarked(id)
      : false;

  const toggleBm = () => {
    if (!id) return;
    if (remote) {
      remoteBm.mutate({ echoId: id, bookmark: !bookmarked });
      return;
    }
    toggleBookmark(id);
    qc.invalidateQueries({ queryKey: ['feed'] });
  };

  if (!item) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center">
        <Text className="text-zinc-400">Echo not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-blue-400">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <Text className="text-white font-semibold text-lg">Echo Thread</Text>
        <View className="flex-row gap-3">
          <Pressable onPress={toggleBm}>
            <Bookmark color={bookmarked ? '#3B82F6' : '#A1A1AA'} size={22} fill={bookmarked ? '#3B82F6' : 'transparent'} />
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <Animated.View entering={FadeInDown.delay(100).springify()} className="flex-row items-center mb-6">
          <View
            className="w-12 h-12 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: item.avatarColor || '#3B82F6' }}
          >
            <Text className="text-white font-bold text-lg">{item.username.charAt(0).toUpperCase()}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-white font-bold text-lg">{item.displayName || item.username}</Text>
            <Text className="text-zinc-500 text-sm">@{item.username}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} className="bg-zinc-900 rounded-2xl p-4 mb-4 border border-zinc-800">
          <Text className="text-zinc-400 font-semibold text-sm mb-2">Prompt</Text>
          <Text className="text-white text-base leading-7">{item.prompt}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()} className="bg-zinc-900 rounded-2xl p-4 mb-6 border border-blue-900/30">
          <Text className="text-blue-400 font-semibold text-sm mb-2">Echo</Text>
          <Text className="text-zinc-200 text-base leading-7">{item.response}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).springify()} className="flex-row items-center justify-between pt-2">
          <LikeButton echoId={item.id} initialLikes={item.likes} initialLiked={item.isLiked} />
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => id && router.push(`/comments/${id}`)}
              className="p-2 rounded-full bg-zinc-900 flex-row items-center gap-1.5 px-3"
            >
              <MessageCircle color="#A1A1AA" size={18} />
              <Text className="text-zinc-400 text-sm">{item.commentCount ?? 0}</Text>
            </Pressable>
            <Pressable onPress={toggleBm} className="p-2 rounded-full bg-zinc-900">
              <Bookmark color={bookmarked ? '#3B82F6' : '#A1A1AA'} size={20} fill={bookmarked ? '#3B82F6' : 'transparent'} />
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/share',
                  params: { prompt: item.prompt, response: item.response },
                })
              }
              className="p-2 rounded-full bg-zinc-900"
            >
              <Share2 color="#A1A1AA" size={20} />
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
