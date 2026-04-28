import React, { useState } from 'react';
import { View, Text, Pressable, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, PaperPlaneTilt, Export } from 'phosphor-react-native';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { FeedItem } from '../types';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { getSessionUserId } from '../lib/supabaseEchoApi';
import { usePublishRemoteEcho } from '../hooks/queries/useSupabaseSocial';
import { coerceFeedItem } from '../lib/localFeedSeed';

export default function ShareScreen() {
  const router = useRouter();
  const { prompt, response } = useLocalSearchParams<{ prompt: string; response: string }>();
  const username    = useAppStore(s => s.username);
  const userId      = useAppStore(s => s.userId);
  const avatarColor = useAppStore(s => s.avatarColor);
  const displayName = useAppStore(s => s.displayName);
  const publishEcho = useAppStore(s => s.publishEcho);
  const { colors, radius, fontSizes, animation } = useTheme();
  const [publishing, setPublishing] = useState(false);
  const remotePublish = usePublishRemoteEcho();
  const remote = isSupabaseRemote();

  const handleNativeShare = async () => {
    if (!prompt || !response) return;
    await Share.share({
      message: `${prompt}\n\n${response}\n\nShared via Echo`,
      title: String(prompt).slice(0, 80),
    });
  };

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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} className="p-1">
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 18 }}>Share Echo</Text>
        <Pressable
          onPress={handlePublish}
          disabled={publishing}
          className="flex-row items-center px-4 py-2"
          style={{ borderRadius: radius.lg, backgroundColor: publishing ? colors.surfaceHover : colors.accent }}
        >
          <PaperPlaneTilt color="#fff" size={16} />
          <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>Post</Text>
        </Pressable>
      </View>

      <View className="flex-1 p-4">
        <Animated.View entering={animation(FadeInDown.delay(100).springify())}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Preview</Text>

          <View className="p-4 mb-4" style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
            <View className="flex-row items-center mb-3">
              <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: colors.accent }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
                  {(username || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{username || 'anonymous'}</Text>
            </View>

            <View className="p-3 mb-3" style={{ backgroundColor: colors.surfaceHover, borderRadius: radius.lg }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '500', fontSize: fontSizes.small }}>You</Text>
              <Text style={{ color: colors.text, marginTop: 4 }}>{prompt}</Text>
            </View>

            <View>
              <Text style={{ color: colors.accent, fontWeight: '500', fontSize: fontSizes.small, marginBottom: 4 }}>Echo</Text>
              <Text style={{ color: colors.textSecondary, lineHeight: 24 }}>{response}</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(200).springify())}>
          <Pressable
            onPress={handleNativeShare}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 14, borderRadius: radius.lg, marginBottom: 12,
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 8,
            }}
          >
            <Export color={colors.text} size={18} />
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.body }}>Share externally</Text>
          </Pressable>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, textAlign: 'center' }}>
            Posting will make this visible to everyone in the Discover feed.
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
