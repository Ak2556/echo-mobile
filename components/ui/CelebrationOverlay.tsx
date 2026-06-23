import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS, ACCENT_COLORS, ACCENT_SPRING, DISPLAY_TYPE, accentShadow, feedbackHaptic } from '../../lib/accentDesign';
import { useAppStore } from '../../store/useAppStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const PARTICLE_COUNT = 24;
const PARTICLE_COLORS = [ACCENT_COLORS.cyan, ACCENT_COLORS.magenta, ACCENT_COLORS.lime, ACCENT_COLORS.violet, ACCENT_COLORS.amber];

interface CelebrationOverlayProps {
  visible: boolean;
  /** Headline copy shown in the center burst (e.g. "PUBLISHED!", "+50 XP"). */
  headline: string;
  /** Secondary copy under the headline. */
  subtitle?: string;
  /** Which gradient to use. Defaults to remix triple. */
  variant?: 'remix' | 'evolutions' | 'forYou' | 'achievement';
  /** Called when the celebration animation finishes (auto ~1.6s). */
  onDone?: () => void;
}

/**
 * Full-screen pointer-events:none confetti + headline celebration. Used for
 * "first publish", "first remix", "10-day streak", and other reward moments.
 *
 * Particles burst from the center, each with a unique randomized vector +
 * rotation. Headline scales in with a spring pop, holds, and fades.
 */
export function CelebrationOverlay({
  visible,
  headline,
  subtitle,
  variant = 'remix',
  onDone,
}: CelebrationOverlayProps) {
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const reduceAnimations = useAppStore(s => s.reduceAnimations);
  const gradient = GRADIENTS[variant];

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {!reduceAnimations &&
        Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
          <Particle key={`p-${i}-${headline}`} index={i} />
        ))}
      <Headline
        headline={headline}
        subtitle={subtitle}
        gradient={gradient}
        haptic={hapticEnabled}
        onDone={onDone}
      />
    </View>
  );
}

function Headline({
  headline,
  subtitle,
  gradient,
  haptic,
  onDone,
}: {
  headline: string;
  subtitle?: string;
  gradient: readonly string[];
  haptic: boolean;
  onDone?: () => void;
}) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (haptic) void feedbackHaptic('celebrate');
    scale.value = withSequence(
      withSpring(1.12, ACCENT_SPRING.pop),
      withSpring(1.0, ACCENT_SPRING.release),
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 160 }),
      withDelay(900, withTiming(0, { duration: 320 }, finished => {
        if (finished && onDone) runOnJS(onDone)();
      })),
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.center} pointerEvents="none">
      <Animated.View style={[style, accentShadow(ACCENT_COLORS.magenta, 'hard')]}>
        <LinearGradient
          colors={gradient as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headlineCard}
        >
          <Text style={styles.headline}>{headline}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function Particle({ index }: { index: number }) {
  // Deterministic-ish randomness per particle index so re-renders don't jitter
  // mid-flight. Uses a tiny PRNG seeded by index.
  const seed = (index * 9301 + 49297) % 233280;
  const rand = (s: number) => ((s * 9301 + 49297) % 233280) / 233280;
  const r1 = rand(seed);
  const r2 = rand(seed + 1);
  const r3 = rand(seed + 2);
  const r4 = rand(seed + 3);

  const angle = r1 * Math.PI * 2;
  const distance = 180 + r2 * 220;
  const targetX = Math.cos(angle) * distance;
  const targetY = Math.sin(angle) * distance - 80; // bias up so they fall after
  const fallY = targetY + 220 + r3 * 180;
  const size = 8 + r4 * 8;
  const color = PARTICLE_COLORS[index % PARTICLE_COLORS.length];

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const burstDuration = 600 + r1 * 200;
    const fallDuration = 800 + r2 * 400;

    x.value = withTiming(targetX, { duration: burstDuration, easing: Easing.out(Easing.cubic) });
    y.value = withSequence(
      withTiming(targetY, { duration: burstDuration, easing: Easing.out(Easing.cubic) }),
      withTiming(fallY, { duration: fallDuration, easing: Easing.in(Easing.quad) }),
    );
    rot.value = withTiming(r3 * 720 - 360, { duration: burstDuration + fallDuration });
    opacity.value = withSequence(
      withTiming(1, { duration: 80 }),
      withDelay(burstDuration + fallDuration - 360, withTiming(0, { duration: 360 })),
    );
    return () => {
      cancelAnimation(x);
      cancelAnimation(y);
      cancelAnimation(rot);
      cancelAnimation(opacity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rot.value}deg` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: SCREEN_W / 2 - size / 2,
          top: SCREEN_H / 2 - size / 2,
          width: size,
          height: size,
          backgroundColor: color,
          borderRadius: r4 > 0.6 ? size / 2 : 2,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headlineCard: {
    paddingHorizontal: 32,
    paddingVertical: 22,
    borderRadius: 28,
    alignItems: 'center',
  },
  headline: {
    ...DISPLAY_TYPE.display,
    color: '#000',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(0,0,0,0.78)',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.4,
    marginTop: 6,
  },
  particle: {
    position: 'absolute',
  },
});
