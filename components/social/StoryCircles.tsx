import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Plus } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { Avatar } from '../ui/Avatar';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { isSupabaseRemote } from '../../lib/remoteConfig';

export function StoryCircles() {
  const router = useRouter();
  const { getActiveStories, username, avatarColor, avatarUrl } = useAppStore();
  const { colors, animation, isUserOnline } = useTheme();
  const stories = getActiveStories();
  const remote = isSupabaseRemote();

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
      {/* Your story — hide the create button when remote (stories not yet server-backed) */}
      {!remote && (
      <Animated.View entering={animation(FadeInRight.delay(0).duration(220))}>
        <AnimatedPressable
          onPress={() => router.push('/create-story')}
          style={{ alignItems: 'center', width: 68 }}
          scaleValue={0.9}
          haptic="light"
        >
          <View style={{ position: 'relative' }}>
            <Avatar
              name={username || '?'}
              color={avatarColor}
              url={avatarUrl}
              size={62}
            />
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
      )}

      {/* Other users' stories */}
      {storyUsers.map((story: any, idx: number) => {
        const hasUnviewed = !story.isViewed;
        const online = isUserOnline(story.userId);

        return (
          <Animated.View
            key={story.userId}
            entering={animation(FadeInRight.delay((idx + 1) * 60).duration(220))}
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
                  <Avatar
                    name={story.displayName}
                    color={story.avatarColor}
                    url={story.avatarUrl}
                    size={56}
                  />
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
