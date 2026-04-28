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
  const getActiveStories = useAppStore(s => s.getActiveStories);
  const username         = useAppStore(s => s.username);
  const avatarColor      = useAppStore(s => s.avatarColor);
  const { colors, animation, isUserOnline } = useTheme();
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
      contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
    >
      {/* Your story */}
      <Animated.View entering={animation(FadeInRight.delay(0).springify())}>
        <AnimatedPressable
          onPress={() => router.push('/create-story' as any)}
          style={{ alignItems: 'center', width: 68 }}
          scaleValue={0.9}
          haptic="light"
        >
          <View style={{ position: 'relative' }}>
            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: 31,
                backgroundColor: avatarColor,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.15)',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 20 }}>
                {(username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            {/* Add button */}
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: colors.bg,
              }}
            >
              <Plus color="#fff" size={11} weight="bold" />
            </View>
          </View>
          <Text
            style={{ color: colors.textSecondary, fontSize: 10, marginTop: 6, fontWeight: '500' }}
          >
            Your story
          </Text>
        </AnimatedPressable>
      </Animated.View>

      {/* Other users' stories */}
      {storyUsers.map((story: any, idx: number) => {
        const hasUnviewed = !story.isViewed;
        const online = isUserOnline(story.userId);

        return (
          <Animated.View
            key={story.userId}
            entering={animation(FadeInRight.delay((idx + 1) * 60).springify())}
          >
            <AnimatedPressable
              onPress={() =>
                router.push({ pathname: '/story', params: { userId: story.userId } })
              }
              style={{ alignItems: 'center', width: 68 }}
              scaleValue={0.9}
              haptic="light"
            >
              <View style={{ position: 'relative' }}>
                {/* Ring for unviewed */}
                <View
                  style={{
                    width: 66,
                    height: 66,
                    borderRadius: 33,
                    padding: 2.5,
                    borderWidth: 2.5,
                    borderColor: hasUnviewed ? colors.accent : 'rgba(255,255,255,0.12)',
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 30,
                      backgroundColor: story.avatarColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
                      {story.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Green online dot */}
                {online && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 2,
                      width: 13,
                      height: 13,
                      borderRadius: 7,
                      backgroundColor: '#22C55E',
                      borderWidth: 2,
                      borderColor: colors.bg,
                    }}
                  />
                )}
              </View>

              <Text
                style={{
                  fontSize: 10,
                  marginTop: 6,
                  fontWeight: '500',
                  color: hasUnviewed ? '#fff' : colors.textMuted,
                }}
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
