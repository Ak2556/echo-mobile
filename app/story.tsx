import React, { useState, useEffect, useRef } from 'react';
import { ICON_SIZE } from '../lib/ui/icons';
import { V2FeatureGuard } from '../components/common/V2FeatureGuard';
import { View, Text, StatusBar } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { safeBack } from '../lib/routing/safeBack';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming, FadeInDown } from 'react-native-reanimated';
import { X, Eye } from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { Avatar } from '../components/ui/Avatar';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/ui/theme';
import { ttx } from '../lib/i18n/i18n';

const STORY_DURATION = 5000;
const PAUSED_DURATION = 999999;

// Stories are flagged off (featureFlags.stories). Without the guard, a saved
// link or a voice route still rendered these screens: create-story showed its
// composer, and story with no stories to show backed out to wherever the user
// came from (often Messages).
export default function StoryScreen() {
  return <V2FeatureGuard flag="stories"><StoryScreenInner /></V2FeatureGuard>;
}

function StoryScreenInner() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
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
          safeBack();
        }
      }, STORY_DURATION);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // currentIndex drives the timer; story?.id prevents re-running on unrelated renders.
    // Adding userStories/router/etc. would cause infinite loops since they're recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, story?.id]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const handleNext = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (currentIndex < userStories.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      safeBack();
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
      <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: colors.bgPure }]}>
        <Text style={{ color: colors.textSecondary }}>{ttx("No stories available")}</Text>
        <AnimatedPressable style={{ marginTop: 16 }} onPress={() => safeBack()} scaleValue={0.95} haptic="light">
          <Text style={{ color: colors.accent }}>{ttx("Close")}</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View style={[{ flex: 1 }, { backgroundColor: colors.bgPure }]}>
      <StatusBar barStyle="light-content" />

      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingTop: 56, marginBottom: 12 }}>
        {userStories.map((_, idx) => (
          <View key={idx} style={[{ flex: 1, height: 3, borderRadius: radius.full, overflow: 'hidden' }, { backgroundColor: colors.surfaceHover }]}>
            {idx < currentIndex ? (
              <View style={[{ height: '100%', borderRadius: radius.full, width: '100%' }, { backgroundColor: colors.text }]} />
            ) : idx === currentIndex ? (
              <Animated.View style={[{ height: '100%', borderRadius: radius.full }, { backgroundColor: colors.text }, progressStyle]} />
            ) : null}
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ marginRight: 10 }}>
            <Avatar name={story.displayName} color={story.avatarColor} url={story.avatarUrl} size={36} />
          </View>
          <View>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.small }}>{story.displayName}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption }}>
              {getTimeAgo(story.createdAt)}
            </Text>
          </View>
        </View>
        <AnimatedPressable style={{ padding: 8 }} onPress={() => safeBack()} scaleValue={0.85} haptic="light">
          <X color={colors.text} size={ICON_SIZE.lg} />
        </AnimatedPressable>
      </View>

      <Animated.View style={{ flex: 1, marginHorizontal: 16, marginBottom: 24 }}
        entering={animation(FadeIn.duration(80))}
      >
        <View
          style={[{ flex: 1, padding: 24, justifyContent: 'center' }, {
            backgroundColor: colors.surface,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.border,
          }]}
        >
          <Animated.View
            entering={animation(FadeInDown.delay(100).duration(220))}
            style={[{ padding: 16, marginBottom: 20 }, { backgroundColor: colors.surfaceHover, borderRadius: radius.lg }]}
          >
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 6 }}>{ttx("ASKED")}</Text>
            <Text style={{ color: colors.text, fontSize: fontSizes.body + 2, fontWeight: '500', lineHeight: (fontSizes.body + 2) * 1.5 }}>{story.prompt}</Text>
          </Animated.View>

          <Animated.View
            entering={animation(FadeInDown.delay(200).duration(220))}
            style={[{ padding: 16 }, {
              backgroundColor: colors.accentMuted,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.accentMuted,
            }]}
          >
            <Text style={{ color: colors.accent, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 6 }}>{ttx("ECHO")}</Text>
            <Text style={{ color: colors.text, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6 }}>{story.response}</Text>
          </Animated.View>

          <Animated.View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, gap: 6 }} entering={animation(FadeInDown.delay(300).duration(220))}>
            <Eye color={colors.textMuted} size={ICON_SIZE.xs} />
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{story.viewCount} {ttx("views")}</Text>
          </Animated.View>
        </View>
      </Animated.View>

      <View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row' }, { top: 120 }]}>
        <AnimatedPressable onPress={handlePrev} style={{ flex: 1 }} scaleValue={1} haptic="none" />
        <AnimatedPressable onPress={handleNext} style={{ flex: 1 }} scaleValue={1} haptic="none" />
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
