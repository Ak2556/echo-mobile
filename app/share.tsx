import React, { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Send } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { FeedItem } from '../types';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { getSessionUserId } from '../lib/supabaseEchoApi';
import { usePublishRemoteEcho } from '../hooks/queries/useSupabaseSocial';
import { coerceFeedItem } from '../lib/localFeedSeed';

export default function ShareScreen() {
  const router = useRouter();
  const { prompt, response } = useLocalSearchParams<{ prompt: string; response: string }>();
  const { username, userId, avatarColor, displayName, publishEcho } = useAppStore();
  const [publishing, setPublishing] = useState(false);
  const remotePublish = usePublishRemoteEcho();
  const remote = isSupabaseRemote();

  const handlePublish = async () => {
    if (!prompt || !response) return;

    if (remote) {
      const uid = await getSessionUserId();
      if (!uid) {
        Alert.alert('Session required', 'Please finish onboarding so we can save your echo.');
        return;
      }
      setPublishing(true);
      try {
        await remotePublish.mutateAsync({
          authorId: uid,
          prompt: String(prompt),
          response: String(response),
        });
        Alert.alert('Published!', 'Your Echo has been shared with the community.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } catch (e) {
        Alert.alert('Could not publish', (e as Error).message);
      } finally {
        setPublishing(false);
      }
      return;
    }

    const echo: FeedItem = coerceFeedItem({
      id: Date.now().toString(),
      userId,
      username: username || 'anonymous',
      displayName: displayName || username || 'anonymous',
      avatarColor,
      isVerified: false,
      prompt: String(prompt),
      response: String(response),
      likes: 0,
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      repostCount: 0,
      commentCount: 0,
      viewCount: 0,
      hashtags: [],
      createdAt: new Date().toISOString(),
    });

    setPublishing(true);
    setTimeout(() => {
      publishEcho(echo);
      Alert.alert('Published!', 'Your Echo has been shared with the community.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      setPublishing(false);
    }, 500);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <Text className="text-white font-semibold text-lg">Share Echo</Text>
        <Pressable
          onPress={handlePublish}
          disabled={publishing}
          className={`flex-row items-center px-4 py-2 rounded-xl ${publishing ? 'bg-zinc-700' : 'bg-blue-600'}`}
        >
          <Send color="#fff" size={16} />
          <Text className="text-white font-semibold ml-2">Post</Text>
        </Pressable>
      </View>

      <View className="flex-1 p-4">
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Preview</Text>

          <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 mb-4">
            <View className="flex-row items-center mb-3">
              <View className="w-8 h-8 rounded-full bg-blue-600 items-center justify-center mr-3">
                <Text className="text-white font-bold text-sm">
                  {(username || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text className="text-white font-semibold">{username || 'anonymous'}</Text>
            </View>

            <View className="bg-zinc-800 rounded-xl p-3 mb-3">
              <Text className="text-zinc-300 font-medium text-sm">You</Text>
              <Text className="text-white mt-1">{prompt}</Text>
            </View>

            <View>
              <Text className="text-blue-400 font-medium text-sm mb-1">Echo</Text>
              <Text className="text-zinc-200 leading-6">{response}</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Text className="text-zinc-500 text-sm text-center">
            This will be visible to everyone in the Discover feed.
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
