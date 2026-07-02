import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { GitBranch } from 'phosphor-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { SpringCounter } from '../ui/SpringCounter';
import { useAppStore } from '../../store/useAppStore';
import { ACCENT_SPRING, feedbackHaptic } from '../../lib/accentDesign';

interface RemixButtonProps {
  echoId: string;
  remixCount?: number;
  authorUsername?: string;
  authorTitle?: string;
  /** Emphasized when remixCount >= 3. */
  hot?: boolean;
  /** Compact mode for inline use (FeedCard action bar) */
  compact?: boolean;
}

/**
 * Tap to add a perspective: the parent's conversation snapshot seeds a fresh
 * chat session and the user can continue from where the author left off.
 * Publishing creates a linked Echo in the parent Evolution.
 *
 * Animated gradient border, double-tap haptic, and optional emphasis when
 * the lineage is active.
 */
export function RemixButton({
  echoId,
  remixCount = 0,
  authorUsername,
  authorTitle,
  hot,
  compact,
}: RemixButtonProps) {
  const router = useRouter();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);

  const press = useSharedValue(1);

  const isHot = hot ?? remixCount >= 3;

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const handlePress = () => {
    if (hapticEnabled) void feedbackHaptic('remix');
    press.value = withSequence(
      withTiming(0.92, { duration: 80 }),
      withSpring(1, ACCENT_SPRING.release),
    );
    router.push({
      pathname: '/remix/[id]',
      params: {
        id: echoId,
        ...(authorUsername ? { author: authorUsername } : {}),
        ...(authorTitle ? { parentTitle: authorTitle } : {}),
      },
    });
  };

  const labelColor = isHot ? '#fff' : '#E4E4E7';
  const padH = compact ? 10 : 14;
  const padV = compact ? 7 : 9;

  return (
    <Animated.View style={containerStyle}>
      <AnimatedPressable
        onPress={handlePress}
        style={styles.touch}
        haptic="none"
        performanceMode="hot"
        accessibilityLabel={
          remixCount > 0 ? `Add perspective — ${remixCount} existing perspectives` : 'Add perspective'
        }
        accessibilityRole="button"
      >
        <View
          style={[
            styles.gradient,
            {
              paddingHorizontal: padH,
              paddingVertical: padV,
              backgroundColor: isHot ? '#D95F2B' : 'rgba(255,255,255,0.08)',
            },
          ]}
        >
          <View style={styles.inner}>
            <GitBranch
              size={compact ? 16 : 18}
              color={labelColor}
              weight="bold"
            />
            <Text
              style={{
                fontWeight: '700',
                fontSize: compact ? 12 : 13,
                color: labelColor,
              }}
            >
              {compact ? 'Perspective' : 'Add Perspective'}
            </Text>
            {remixCount > 0 && (
              <SpringCounter
                value={remixCount}
                performanceMode="hot"
                style={{
                  fontWeight: '700',
                  color: labelColor,
                  fontSize: compact ? 12 : 13,
                  marginLeft: 2,
                  fontVariant: ['tabular-nums'],
                }}
              />
            )}
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  touch: { borderRadius: 999 },
  gradient: {
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
