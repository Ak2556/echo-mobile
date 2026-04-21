import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Send, Sparkles, Hash } from 'lucide-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { FeedItem } from '../types';
import { coerceFeedItem } from '../lib/localFeedSeed';
import { playSoundEffect } from '../lib/sound';

export default function CreatePostScreen() {
  const router = useRouter();
  const { colors, radius, fontSizes, animation } = useTheme();
  const { username, userId, avatarColor, displayName, publishEcho } = useAppStore();

  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [publishing, setPublishing] = useState(false);

  const canPublish = prompt.trim().length > 0 && response.trim().length > 0 && !publishing;

  const handlePublish = () => {
    if (!canPublish) return;
    const hashtags = tagsRaw
      .split(/[\s,]+/)
      .map(t => t.replace(/^#/, '').trim())
      .filter(Boolean);

    const echo: FeedItem = coerceFeedItem({
      id: Date.now().toString(),
      userId,
      username: username || 'anonymous',
      displayName: displayName || username || 'anonymous',
      avatarColor: avatarColor || colors.accent,
      isVerified: false,
      prompt: prompt.trim(),
      response: response.trim(),
      likes: 0,
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      repostCount: 0,
      commentCount: 0,
      viewCount: 0,
      hashtags,
      createdAt: new Date().toISOString(),
    });

    setPublishing(true);
    setTimeout(() => {
      publishEcho(echo);
      playSoundEffect('success');
      showToast('Echo published!', '\u{2728}');
      setPublishing(false);
      router.back();
    }, 300);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} className="p-1" scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>New Echo</Text>
        <AnimatedPressable
          onPress={handlePublish}
          disabled={!canPublish}
          scaleValue={0.92}
          haptic="medium"
          className="flex-row items-center px-3.5 py-2"
          style={{
            borderRadius: radius.full,
            backgroundColor: canPublish ? colors.accent : colors.surfaceHover,
            opacity: canPublish ? 1 : 0.6,
          }}
        >
          <Send color="#fff" size={14} />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small, marginLeft: 6 }}>
            {publishing ? 'Posting...' : 'Post'}
          </Text>
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
          <Animated.View entering={animation(FadeInDown.delay(50).springify())} className="flex-row items-center mb-4">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: avatarColor || colors.accent }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.body }}>
                {(username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>
                {displayName || username || 'You'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{username || 'anonymous'}</Text>
            </View>
          </Animated.View>

          <Animated.View entering={animation(FadeInDown.delay(100).springify())}>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>Prompt</Text>
            <View
              className="p-4 mb-4"
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <TextInput
                multiline
                value={prompt}
                onChangeText={setPrompt}
                placeholder="What did you ask Echo?"
                placeholderTextColor={colors.textMuted}
                maxLength={280}
                style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 60 }}
              />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 6 }}>
                {prompt.length}/280
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={animation(FadeInDown.delay(150).springify())}>
            <View className="flex-row items-center mb-2 ml-1 gap-1.5">
              <Sparkles color={colors.accent} size={12} />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Echo Response</Text>
            </View>
            <View
              className="p-4 mb-4"
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <TextInput
                multiline
                value={response}
                onChangeText={setResponse}
                placeholder="Share what the AI said, your insights, or anything worth echoing..."
                placeholderTextColor={colors.textMuted}
                maxLength={1000}
                style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 120 }}
              />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 6 }}>
                {response.length}/1000
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={animation(FadeInDown.delay(200).springify())}>
            <View className="flex-row items-center mb-2 ml-1 gap-1.5">
              <Hash color={colors.textSecondary} size={12} />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Tags</Text>
            </View>
            <View
              className="p-3 mb-4"
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <TextInput
                value={tagsRaw}
                onChangeText={setTagsRaw}
                placeholder="ai, react, tips (comma-separated)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={{ color: colors.text, fontSize: fontSizes.body }}
              />
            </View>
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
