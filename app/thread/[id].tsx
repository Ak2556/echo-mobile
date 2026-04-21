import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Bookmark, Share2, MessageCircle } from 'lucide-react-native';
import { LikeButton } from '../../components/social/LikeButton';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
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
  const { colors, radius, fontSizes, showAvatars, animation } = useTheme();
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} className="items-center justify-center">
        <Text style={{ color: colors.textSecondary }}>Echo not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text style={{ color: colors.accent }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} className="p-1">
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 18 }}>Echo Thread</Text>
        <View className="flex-row gap-3">
          <Pressable onPress={toggleBm}>
            <Bookmark color={bookmarked ? colors.accent : colors.textSecondary} size={22} fill={bookmarked ? colors.accent : 'transparent'} />
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <Animated.View entering={animation(FadeInDown.delay(100).springify())} className="flex-row items-center mb-6">
          {showAvatars && (
            <View
              className="w-12 h-12 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: item.avatarColor || colors.accent }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.title * 0.9 }}>{item.username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View className="flex-1">
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>{item.displayName || item.username}</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>@{item.username}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(200).springify())} className="p-4 mb-4" style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: fontSizes.small, marginBottom: 8 }}>Prompt</Text>
          <Text style={{ color: colors.text, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6 }}>{item.prompt}</Text>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(300).springify())} className="p-4 mb-6" style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.accentMuted }}>
          <Text style={{ color: colors.accent, fontWeight: '600', fontSize: fontSizes.small, marginBottom: 8 }}>Echo</Text>
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6 }}>{item.response}</Text>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(400).springify())} className="flex-row items-center justify-between pt-2">
          <LikeButton echoId={item.id} initialLikes={item.likes} initialLiked={item.isLiked} />
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => id && router.push(`/comments/${id}`)}
              className="p-2 flex-row items-center gap-1.5 px-3"
              style={{ borderRadius: radius.full, backgroundColor: colors.surface }}
            >
              <MessageCircle color={colors.textSecondary} size={18} />
              <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small }}>{item.commentCount ?? 0}</Text>
            </Pressable>
            <Pressable onPress={toggleBm} className="p-2" style={{ borderRadius: radius.full, backgroundColor: colors.surface }}>
              <Bookmark color={bookmarked ? colors.accent : colors.textSecondary} size={20} fill={bookmarked ? colors.accent : 'transparent'} />
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/share',
                  params: { prompt: item.prompt, response: item.response },
                })
              }
              className="p-2"
              style={{ borderRadius: radius.full, backgroundColor: colors.surface }}
            >
              <Share2 color={colors.textSecondary} size={20} />
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
