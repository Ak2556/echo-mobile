import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StatusBar } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming, FadeInDown } from 'react-native-reanimated';
import { X, Eye } from 'lucide-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';

const STORY_DURATION = 5000;
const PAUSED_DURATION = 999999;

export default function StoryScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { getActiveStories, markStoryViewed, autoplayStories } = useAppStore();
  const { colors, radius, fontSizes, animation } = useTheme();

  const allStories = getActiveStories();
  const userStories = userId ? allStories.filter(s => s.userId === userId) : allStories;

  const [currentIndex, setCurrentIndex] = useState(0);
  const progress = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const story = userStories[currentIndex];

  useEffect(() => {
    if (!story) return;

    markStoryViewed(story.id);
    const duration = autoplayStories ? STORY_DURATION : PAUSED_DURATION;
    progress.value = 0;
    progress.value = withTiming(1, { duration });

    if (autoplayStories) {
      timerRef.current = setTimeout(() => {
        if (currentIndex < userStories.length - 1) {
          setCurrentIndex(i => i + 1);
        } else {
          router.back();
        }
      }, STORY_DURATION);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentIndex, story?.id]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const handleNext = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (currentIndex < userStories.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      router.back();
    }
  };

  const handlePrev = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    }
  };

  if (!story) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bgPure }}>
        <Text style={{ color: colors.textSecondary }}>No stories available</Text>
        <AnimatedPressable onPress={() => router.back()} className="mt-4" scaleValue={0.95} haptic="light">
          <Text style={{ color: colors.accent }}>Close</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bgPure }}>
      <StatusBar barStyle="light-content" />

      <View className="flex-row gap-1 px-3 pt-14 mb-3">
        {userStories.map((_, idx) => (
          <View key={idx} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceHover }}>
            {idx < currentIndex ? (
              <View className="h-full rounded-full w-full" style={{ backgroundColor: colors.text }} />
            ) : idx === currentIndex ? (
              <Animated.View className="h-full rounded-full" style={[{ backgroundColor: colors.text }, progressStyle]} />
            ) : null}
          </View>
        ))}
      </View>

      <View className="flex-row items-center justify-between px-4 mb-4">
        <View className="flex-row items-center">
          <View
            className="w-9 h-9 rounded-full items-center justify-center mr-2.5"
            style={{ backgroundColor: story.avatarColor }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
              {story.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.small }}>{story.displayName}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption }}>
              {getTimeAgo(story.createdAt)}
            </Text>
          </View>
        </View>
        <AnimatedPressable onPress={() => router.back()} className="p-2" scaleValue={0.85} haptic="light">
          <X color={colors.text} size={24} />
        </AnimatedPressable>
      </View>

      <Animated.View
        entering={animation(FadeIn.duration(300))}
        className="flex-1 mx-4 mb-6"
      >
        <View
          className="flex-1 p-6 justify-center"
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Animated.View
            entering={animation(FadeInDown.delay(100).springify())}
            className="p-4 mb-5"
            style={{ backgroundColor: colors.surfaceHover, borderRadius: radius.lg }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 6 }}>ASKED</Text>
            <Text style={{ color: colors.text, fontSize: fontSizes.body + 2, fontWeight: '500', lineHeight: (fontSizes.body + 2) * 1.5 }}>{story.prompt}</Text>
          </Animated.View>

          <Animated.View
            entering={animation(FadeInDown.delay(200).springify())}
            className="p-4"
            style={{
              backgroundColor: colors.accentMuted,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.accentMuted,
            }}
          >
            <Text style={{ color: colors.accent, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 6 }}>ECHO</Text>
            <Text style={{ color: colors.text, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6 }}>{story.response}</Text>
          </Animated.View>

          <Animated.View entering={animation(FadeInDown.delay(300).springify())} className="flex-row items-center justify-center mt-6 gap-1.5">
            <Eye color={colors.textMuted} size={14} />
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{story.viewCount} views</Text>
          </Animated.View>
        </View>
      </Animated.View>

      <View className="absolute inset-0 flex-row" style={{ top: 120 }}>
        <AnimatedPressable onPress={handlePrev} className="flex-1" scaleValue={1} haptic="none" />
        <AnimatedPressable onPress={handleNext} className="flex-1" scaleValue={1} haptic="none" />
      </View>
    </View>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
