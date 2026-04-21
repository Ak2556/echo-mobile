import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ArrowLeft, Send, Sparkles, Radio, Clock } from 'lucide-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { Story } from '../types';
import { playSoundEffect } from '../lib/sound';

const STORY_DURATION_HOURS = 24;

export default function CreateStoryScreen() {
  const router = useRouter();
  const { colors, radius, fontSizes, animation } = useTheme();
  const { username, userId, avatarColor, displayName, addStory } = useAppStore();

  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [publishing, setPublishing] = useState(false);

  const canPublish = prompt.trim().length > 0 && response.trim().length > 0 && !publishing;

  const handlePublish = () => {
    if (!canPublish) return;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + STORY_DURATION_HOURS * 60 * 60 * 1000);

    const story: Story = {
      id: `story_${Date.now()}`,
      userId,
      username: username || 'anonymous',
      displayName: displayName || username || 'anonymous',
      avatarColor: avatarColor || colors.accent,
      prompt: prompt.trim(),
      response: response.trim(),
      viewCount: 0,
      isViewed: true,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    setPublishing(true);
    setTimeout(() => {
      addStory(story);
      playSoundEffect('success');
      showToast('Story shared for 24h', '\u{1F4E1}');
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
        <View className="flex-row items-center gap-2">
          <Radio color={colors.accent} size={16} />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>New Story</Text>
        </View>
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
            {publishing ? 'Sharing...' : 'Share'}
          </Text>
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
          <Animated.View entering={animation(FadeIn.delay(50))} className="flex-row items-center mb-4">
            <View
              className="w-12 h-12 rounded-full items-center justify-center mr-3"
              style={{
                backgroundColor: avatarColor || colors.accent,
                borderWidth: 2.5,
                borderColor: colors.accent,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.body }}>
                {(username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>
                {displayName || username || 'You'}
              </Text>
              <View className="flex-row items-center gap-1 mt-0.5">
                <Clock color={colors.textMuted} size={10} />
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>Expires in 24 hours</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={animation(FadeInDown.delay(100).springify())}>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>Asked</Text>
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
                placeholder="What question sparked this story?"
                placeholderTextColor={colors.textMuted}
                maxLength={200}
                style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 50 }}
              />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 6 }}>
                {prompt.length}/200
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={animation(FadeInDown.delay(150).springify())}>
            <View className="flex-row items-center mb-2 ml-1 gap-1.5">
              <Sparkles color={colors.accent} size={12} />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Echo</Text>
            </View>
            <View
              className="p-4 mb-4"
              style={{
                backgroundColor: colors.accentMuted,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.accent,
              }}
            >
              <TextInput
                multiline
                value={response}
                onChangeText={setResponse}
                placeholder="The wisdom to share..."
                placeholderTextColor={colors.textMuted}
                maxLength={500}
                style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 100 }}
              />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 6 }}>
                {response.length}/500
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={animation(FadeInDown.delay(200).springify())}>
            <View
              className="p-3 flex-row items-center gap-2"
              style={{
                backgroundColor: colors.surfaceHover,
                borderRadius: radius.md,
                borderLeftWidth: 3,
                borderLeftColor: colors.accent,
              }}
            >
              <Radio color={colors.accent} size={14} />
              <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, flex: 1 }}>
                Stories appear in the home feed circles and disappear after 24 hours.
              </Text>
            </View>
          </Animated.View>

          <View className="h-10" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
