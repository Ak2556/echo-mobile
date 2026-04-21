import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Plus } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';

export function StoryCircles() {
  const router = useRouter();
  const { getActiveStories, username, avatarColor } = useAppStore();
  const { colors, animation } = useTheme();
  const stories = getActiveStories();

  const userStories = stories.reduce((acc, story) => {
    if (!acc[story.userId]) {
      acc[story.userId] = { ...story, count: 1 };
    } else {
      acc[story.userId].count++;
    }
    return acc;
  }, {} as Record<string, any>);

  const storyUsers = Object.values(userStories);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 12 }}
      contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
    >
      <Animated.View entering={animation(FadeInRight.delay(0).springify())}>
        <AnimatedPressable onPress={() => router.push('/create-story' as any)} className="items-center w-[68px]" scaleValue={0.9} haptic="light">
          <View className="relative">
            <View
              className="w-[60px] h-[60px] rounded-full items-center justify-center"
              style={{ backgroundColor: avatarColor, borderWidth: 2, borderColor: colors.border }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 20 }}>
                {(username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="absolute bottom-0 right-0 w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg }}>
              <Plus color="#fff" size={12} strokeWidth={3} />
            </View>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 6, fontWeight: '500' }}>Your story</Text>
        </AnimatedPressable>
      </Animated.View>

      {storyUsers.map((story: any, idx: number) => {
        const hasUnviewed = !story.isViewed;
        return (
          <Animated.View key={story.userId} entering={animation(FadeInRight.delay((idx + 1) * 60).springify())}>
            <AnimatedPressable
              onPress={() => router.push({ pathname: '/story', params: { userId: story.userId } })}
              className="items-center w-[68px]"
              scaleValue={0.9}
              haptic="light"
            >
              <View
                className="w-[64px] h-[64px] rounded-full items-center justify-center p-[2.5px]"
                style={{
                  borderWidth: 2.5,
                  borderColor: hasUnviewed ? colors.accent : colors.surfaceHover,
                  borderRadius: 999,
                }}
              >
                <View
                  className="w-full h-full rounded-full items-center justify-center"
                  style={{ backgroundColor: story.avatarColor }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
                    {story.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text
                style={{ fontSize: 10, marginTop: 6, fontWeight: '500', color: hasUnviewed ? colors.text : colors.textMuted }}
                numberOfLines={1}
              >
                {story.username}
              </Text>
            </AnimatedPressable>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}
