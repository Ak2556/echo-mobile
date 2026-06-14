import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { GitBranch } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { SpringCounter } from '../ui/SpringCounter';
import { useAppStore } from '../../store/useAppStore';
import { GRADIENTS, NEON, NEON_SPRING, neonGlow, neonHaptic } from '../../lib/neonDesign';

interface RemixButtonProps {
  echoId: string;
  remixCount?: number;
  authorUsername?: string;
  authorTitle?: string;
  /** Hot when remixCount >= 3 — pulses + glows to attract attention */
  hot?: boolean;
  /** Compact mode for inline use (FeedCard action bar) */
  compact?: boolean;
}

/**
 * Tap to fork an Echo: the parent's full conversation snapshot seeds a fresh
 * chat session and the user can continue from where the author left off.
 * After they ask Gemini at least one more turn, they can publish the result
 * as a remix linked back to the parent.
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
  const reduceAnimations = useAppStore(s => s.reduceAnimations);

  const pulse = useSharedValue(1);
  const press = useSharedValue(1);

  const isHot = hot ?? remixCount >= 3;

  useEffect(() => {
    if (isHot && !reduceAnimations) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 900 }),
          withTiming(1.0, { duration: 900 }),
        ),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [isHot, pulse, reduceAnimations]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value * press.value }],
  }));

  const handlePress = () => {
    if (hapticEnabled) void neonHaptic('remix');
    press.value = withSequence(
      withTiming(0.92, { duration: 80 }),
      withSpring(1, NEON_SPRING.release),
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

  const labelColor = isHot ? NEON.cyan : '#E4E4E7';
  const padH = compact ? 10 : 14;
  const padV = compact ? 7 : 9;

  return (
    <Animated.View style={[containerStyle, isHot ? neonGlow(NEON.cyan, 'med') : null]}>
      <AnimatedPressable
        onPress={handlePress}
        style={styles.touch}
        haptic="none"
        performanceMode="hot"
        accessibilityLabel={
          remixCount > 0 ? `Remix conversation — ${remixCount} existing remixes` : 'Remix this conversation'
        }
        accessibilityRole="button"
      >
        <LinearGradient
          colors={isHot ? GRADIENTS.remix : ['rgba(34,245,255,0.18)', 'rgba(155,91,255,0.18)', 'rgba(255,61,216,0.18)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, { paddingHorizontal: padH, paddingVertical: padV }]}
        >
          <View style={styles.inner}>
            <GitBranch
              size={compact ? 16 : 18}
              color={isHot ? '#000' : labelColor}
              weight={isHot ? 'fill' : 'bold'}
            />
            <Text
              style={{
                fontWeight: '800',
                fontSize: compact ? 12 : 13,
                color: isHot ? '#000' : labelColor,
                letterSpacing: 0.3,
              }}
            >
              Remix
            </Text>
            {remixCount > 0 && (
              <SpringCounter
                value={remixCount}
                performanceMode="hot"
                style={{
                  fontWeight: '900',
                  color: isHot ? '#000' : labelColor,
                  fontSize: compact ? 12 : 13,
                  marginLeft: 2,
                  fontVariant: ['tabular-nums'],
                }}
              />
            )}
          </View>
        </LinearGradient>
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
