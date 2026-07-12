import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ArrowLeft, PaperPlaneTilt, Lightning, Broadcast, Clock } from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { Avatar } from '../components/ui/Avatar';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { Story } from '../types';
import { playSoundEffect } from '../lib/sound';
import { isSupabaseRemote } from '../lib/remoteConfig';

const STORY_DURATION_HOURS = 24;

export default function CreateStoryScreen() {
  const router = useRouter();
  const { colors, radius, fontSizes, animation } = useTheme();
  const { username, userId, avatarColor, avatarUrl, displayName, addStory } = useAppStore();

  // Hooks must always be called unconditionally
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [publishing, setPublishing] = useState(false);

  if (isSupabaseRemote()) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <AnimatedPressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }} scaleValue={0.88} haptic="light">
            <ArrowLeft color={colors.text} size={24} />
          </AnimatedPressable>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>Create Story</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Broadcast color={colors.accent} size={48} />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18, marginTop: 16, textAlign: 'center' }}>Stories are unavailable</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 21 }}>
            Share your thoughts as an Echo instead. Echoes stay available in your feed.
          </Text>
          <AnimatedPressable
            onPress={() => router.replace('/create-post')}
            style={{ marginTop: 24, backgroundColor: colors.accent, borderRadius: radius.full, paddingHorizontal: 24, paddingVertical: 12 }}
            haptic="medium"
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Share an Echo instead</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => router.back()}
            style={{ marginTop: 12, borderRadius: radius.full, paddingHorizontal: 24, paddingVertical: 12 }}
            haptic="light"
          >
            <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 14 }}>Go back</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    );
  }

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
      showToast('Story shared for 24h', 'Broadcast');
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
          <Broadcast color={colors.accent} size={16} />
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
          <PaperPlaneTilt color="#fff" size={14} />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small, marginLeft: 6 }}>
            {publishing ? 'Sharing...' : 'Share'}
          </Text>
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
          <Animated.View entering={animation(FadeIn.delay(50))} className="flex-row items-center mb-4">
            <View className="mr-3" style={{ borderRadius: 24, borderWidth: 2.5, borderColor: colors.accent }}>
              <Avatar name={username || '?'} color={avatarColor} url={avatarUrl} size={43} />
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

          <Animated.View entering={animation(FadeInDown.delay(100).duration(220))}>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 8, marginLeft: 4 }}>Asked</Text>
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

          <Animated.View entering={animation(FadeInDown.delay(150).duration(220))}>
            <View className="flex-row items-center mb-2 ml-1 gap-1.5">
              <Lightning color={colors.accent} size={12} />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600' }}>Echo</Text>
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

          <Animated.View entering={animation(FadeInDown.delay(200).duration(220))}>
            <View
              className="p-3 flex-row items-center gap-2"
              style={{
                backgroundColor: colors.surfaceHover,
                borderRadius: radius.md,
                borderLeftWidth: 3,
                borderLeftColor: colors.accent,
              }}
            >
              <Broadcast color={colors.accent} size={14} />
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
